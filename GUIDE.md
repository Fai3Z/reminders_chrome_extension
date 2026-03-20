# Local TXT reminders: Chrome extension + FastAPI

This project gives you **scheduled browser popup windows** that show the contents of plain `.txt` files. Schedules and file paths are declared in **`backend/data/config.yaml`**. A **Manifest V3** extension asks the Python API once per minute whether anything is due right now.

There is **no PyScript** and no WASM Python in the browser: the extension is normal JavaScript; **FastAPI** reads the text files on disk.

## Cost-free setup (recommended)

| Piece | Cost | Role |
|--------|------|------|
| **FastAPI** on your PC | Free | Reads YAML + `.txt`, exposes `/api/reminders/due` |
| **Chrome extension** (unpacked) | Free | `chrome.alarms` every minute → `fetch` → optional popup window |
| **Cron** (optional) | Free | Only if you want the backend **process** to start on boot; scheduling is already handled by the extension + API |

You do **not** need a paid host for daily use: run the backend locally and keep Chrome running (or rely on OS notifications later if you extend the project).

## Repository layout

```text
d98/
├── GUIDE.md                 ← you are here
├── requirements.txt         ← Python dependencies
├── backend/
│   ├── main.py              ← FastAPI app
│   └── data/
│       ├── config.yaml      ← which .txt files, which HH:MM times (24h, local server clock)
│       └── reminders/       ← your .txt bodies
│           ├── morning.txt
│           └── evening.txt
└── extension/               ← Load unpacked in Chrome
    ├── manifest.json
    ├── background.js
    ├── popup.html / popup.js / popup.css
    ├── reminder.html / reminder.js / reminder.css
    └── icons/icon128.png
```

## Quick start

### 1. Python environment

```bash
cd /path/to/d98
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Run the backend

From the repo root:

```bash
source .venv/bin/activate
python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8765
```

Defaults match the extension (`http://127.0.0.1:8765`). Override bind with env if needed:

- `REMINDER_BIND_HOST` (default `127.0.0.1`)
- `REMINDER_BIND_PORT` (default `8765`)

Sanity checks:

- `GET /health` — confirms the API is up and shows the `data` directory path.
- `GET /api/reminders` — lists configured reminders and times.
- `GET /api/reminders/due` — items whose **current server minute** matches a configured time (optional test: `?now_iso=2026-03-20T09:00:00`).

### 3. Load the extension in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. **Load unpacked** → choose the `extension/` folder (the one that contains `manifest.json`).
4. Pin the extension if you like; open the popup to **Test connection** or **Poll for due reminders now**.

**Important:** Chrome must be allowed to call your backend. The manifest already includes host permission for `http://127.0.0.1/*` and `http://localhost/*`. If you change host or port, update **`extension/manifest.json`** `host_permissions` and the **Backend URL** in the popup (stored in `chrome.storage.sync`).

## Configuring reminders

### Add or edit text

Put files under `backend/data/reminders/` (or another directory if you later change `main.py`). Plain UTF-8 text is fine.

### Point `config.yaml` at those files

Example:

```yaml
reminders:
  - id: morning
    title: Morning note
    file: morning.txt
    times:
      - "09:00"
      - "12:00"

  - id: evening
    title: Evening note
    file: evening.txt
    times:
      - "18:30"
```

Rules:

- **`id`**: stable slug used for deduplication in the extension.
- **`file`**: name relative to `backend/data/reminders/`.
- **`times`**: list of `HH:MM` in **24-hour** notation, interpreted in the **same timezone as the machine running the API** (typically your laptop’s local time).

After edits, **reload is automatic** if you use `uvicorn` with `--reload`; otherwise restart the server process.

## How scheduling works (no server cron required)

1. **`background.js`** registers a `chrome.alarms` timer with **`periodInMinutes: 1`**.
2. Each tick calls **`GET /api/reminders/due`** on your backend.
3. The backend compares **server local** `HH:MM` to each reminder’s configured times.
4. For each match, the extension opens a small **`reminder.html`** popup window (after deduplicating so the same slot does not spam you).

So the “cron-like” behaviour is **split**: YAML defines *when*; the API defines *what is due now*; the extension *pulls* once per minute. That stays simple and works well on a free home setup.

If you want the **backend process** to start on login without a terminal, use a **systemd user service**, **cron `@reboot`**, or **launchd** on macOS—separate from reminder *times*.

## Optional: truly free remote hosting later

To run the API off your laptop:

1. Deploy this FastAPI app to a provider with a free tier (e.g. **Render**, **Fly.io**, **Railway**—offers change over time; pick one that serves HTTPS).
2. Add your HTTPS origin to **`host_permissions`** in `manifest.json`.
3. Set **Backend URL** in the extension popup to that origin.

You will need to **host the `.txt` content** on the server or in attached storage; this scaffold reads from the server filesystem next to `config.yaml`.

## Security notes

- This scaffold enables **CORS `*`** for ease of local development. Tighten `allow_origins` before exposing the API on the public internet.
- The extension talks **HTTP** to localhost by design; do not put secrets in reminder `.txt` files if your machine is shared.

## Scaling the scaffold

- **Multiple files**: add rows under `reminders:` in `config.yaml`.
- **Richer payloads**: extend Pydantic models in `backend/main.py` and the popup UI.
- **Push instead of poll**: optional WebSocket or SSE from FastAPI; the extension would subscribe from the service worker (more moving parts).
- **Tests**: `GET /api/reminders/due?now_iso=...` keeps time deterministic.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Popup says connection failed | Backend running? Port 8765? Firewall? `curl http://127.0.0.1:8765/health` |
| Reminder never appears | Times must match **current minute** on the **server**; timezone skew if API runs in Docker/VM |
| Duplicate windows | Should not happen for the same `id` + day + time; report if you see otherwise |
| `Load unpacked` errors | Select the folder that **directly** contains `manifest.json` |

---

You can treat this repo as a **minimal production-shaped demo**: clear separation between data (`data/`), API (`main.py`), and client (`extension/`).
