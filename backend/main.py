"""
FastAPI backend: serves reminder text and schedules defined in data/config.yaml
and data/reminders/*.txt files.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Project layout: backend/main.py -> repo root is parent of backend/
REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(__file__).resolve().parent / "data"
REMINDERS_DIR = DATA_DIR / "reminders"
CONFIG_PATH = DATA_DIR / "config.yaml"


@dataclass(frozen=True)
class ReminderEntry:
    id: str
    title: str
    file: str
    times: tuple[str, ...]

    def content(self) -> str:
        path = REMINDERS_DIR / self.file
        if not path.is_file():
            raise FileNotFoundError(path)
        return path.read_text(encoding="utf-8").strip()


def _load_config_raw() -> dict[str, Any]:
    if not CONFIG_PATH.is_file():
        return {"reminders": []}
    with CONFIG_PATH.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {"reminders": []}


def load_reminders() -> list[ReminderEntry]:
    raw = _load_config_raw()
    items = raw.get("reminders") or []
    out: list[ReminderEntry] = []
    for i, row in enumerate(items):
        rid = str(row.get("id") or f"reminder_{i}")
        title = str(row.get("title") or rid)
        file = str(row.get("file") or "")
        times_raw = row.get("times") or []
        if not file:
            continue
        times = tuple(str(t).strip() for t in times_raw if str(t).strip())
        out.append(ReminderEntry(id=rid, title=title, file=file, times=times))
    return out


def _normalize_hm(t: str) -> str:
    parts = t.strip().split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid time '{t}', expected HH:MM (24h)")
    h, m = int(parts[0]), int(parts[1])
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise ValueError(f"Invalid time '{t}'")
    return f"{h:02d}:{m:02d}"


class ReminderPublic(BaseModel):
    id: str
    title: str
    file: str
    times: list[str]


class DueReminder(BaseModel):
    id: str
    title: str
    content: str
    fired_at_time: str = Field(
        description="The schedule slot (HH:MM) that matched this fire."
    )


class HealthResponse(BaseModel):
    ok: bool
    data_dir: str


app = FastAPI(title="Chrome Reminder Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(ok=True, data_dir=str(DATA_DIR.resolve()))


@app.get("/api/reminders", response_model=list[ReminderPublic])
def list_reminders() -> list[ReminderPublic]:
    reminders = load_reminders()
    return [
        ReminderPublic(
            id=r.id,
            title=r.title,
            file=r.file,
            times=[_normalize_hm(t) for t in r.times],
        )
        for r in reminders
    ]


@app.get("/api/reminders/due", response_model=list[DueReminder])
def reminders_due(
    now_iso: str | None = None,
) -> list[DueReminder]:
    """
    Return reminders that should fire for the current local server minute.
    Optional query `now_iso` (ISO8601) is for tests only; defaults to real now.
    """
    if now_iso:
        try:
            now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
        except ValueError as e:
            raise HTTPException(status_code=400, detail="Invalid now_iso") from e
    else:
        now = datetime.now()
    hm = f"{now.hour:02d}:{now.minute:02d}"

    due: list[DueReminder] = []
    for r in load_reminders():
        normalized = [_normalize_hm(t) for t in r.times]
        if hm not in normalized:
            continue
        try:
            text = r.content()
        except FileNotFoundError:
            text = f"(missing file: {r.file})"
        due.append(
            DueReminder(id=r.id, title=r.title, content=text, fired_at_time=hm)
        )
    return due


@app.get("/api/reminders/{reminder_id}/content")
def reminder_content(reminder_id: str) -> dict[str, str]:
    for r in load_reminders():
        if r.id == reminder_id:
            try:
                return {"id": r.id, "content": r.content()}
            except FileNotFoundError:
                raise HTTPException(status_code=404, detail="Reminder file missing")
    raise HTTPException(status_code=404, detail="Unknown reminder id")


def main() -> None:
    import uvicorn

    host = os.environ.get("REMINDER_BIND_HOST", "127.0.0.1")
    port = int(os.environ.get("REMINDER_BIND_PORT", "8765"))
    uvicorn.run("main:app", host=host, port=port, reload=True)


if __name__ == "__main__":
    main()
