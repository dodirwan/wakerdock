# WakerDock — QoderWake 8-Bit Virtual Office (containerized)

Node.js virtual office UI + API, packaged as an OCI image. Zero npm dependencies —
the image only needs the Node runtime.

## Build & run

```bash
docker build -t wakerdock:latest .
docker run --rm -p 5173:5173 -v wakerdock-data:/app/data wakerdock:latest
```

or with Compose:

```bash
docker compose up --build
```

Open <http://localhost:5173>.

## Environment variables

| Variable              | Default       | Purpose                                                     |
| --------------------- | ------------- | ----------------------------------------------------------- |
| `HOST`                | `0.0.0.0`     | Bind address. Must be `0.0.0.0` inside a container.          |
| `PORT`                | `5173`        | Listen port. Auto-increments if the port is already in use.  |
| `QODERWAKE_BIN`       | `qoderwake`   | Path to the QoderWake CLI.                                   |
| `QWEN_BIN`            | `qwen`        | Path to the Qwen Code CLI.                                   |
| `SUMMER_CONSOLE_CWD`  | Windows path  | Workspace used by the Windows-only CLI launcher.             |
| `WORKFILE_ROOT`       | Windows path  | Root of the agent work files scanned for workflow artifacts. |

## OpenShift notes

The image is built to satisfy OpenShift's restricted SCC without any extra config:

- Runs as `USER 1001:0`. OpenShift overrides the UID with an arbitrary value from the
  namespace range, but that UID always has primary group `0` — `/app` and `/app/data` are
  `chgrp 0` + `chmod g=u`, so the random UID can still write its state.
- Listens on `5173`, an unprivileged port.
- No capability, no hostPath, no privileged mode, no outbound requirement at build time
  beyond the base image.
- Liveness / readiness probe: `GET /` on port `5173` (returns the office UI, HTTP 200).
- Persistent state lives in `/app/data` (conversations, workflow runs, task log, caches).
  Attach a PVC there; without one the container still starts but loses state on restart.
- The route terminates TLS, so the API validates same-origin requests against
  `X-Forwarded-Proto` + `Host` rather than a hardcoded `127.0.0.1:5173`.

## Scope of this image

This image ships the office server and UI only. The two agent CLIs it can drive
(`qoderwake`, `qwen`) are **not** installed in the image:

- Static UI, game renderer, and all HTTP endpoints are served normally.
- Endpoints that shell out to QoderWake (`/api/office` roster, `/api/messages`,
  workflow runs) return a structured error instead of data, and the server keeps running.
- `/api/summer/console` returns `501` by design on any non-Windows platform.
- `data/roster-cache.json` is read at startup if present, so a pre-seeded cache will
  populate the office without a live QoderWake daemon.

Wiring the container to a QoderWake daemon is a separate step and is intentionally not
part of this image.
