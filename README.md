# CodeArena

CodeArena is a Dockerized coding contest platform. Milestone 0 established the infrastructure skeleton. Milestone 1 built the Express API foundation. Milestone 2 added the PostgreSQL database foundation. Milestone 3 added authentication and RBAC. Milestone 4 added Admin and Participant application API contracts. Milestone 5 added the RabbitMQ messaging architecture. **Milestone 6** turns the Worker into a real background consumer of the execution queue, extracts shared messaging into `packages/messaging`, and keeps the API as the job publisher. It does not call Judge0 or execute user code. The official UI is the unified Next.js app in `apps/frontend`, served through Nginx.

## Architecture overview

Intended runtime flow (later milestones):

```text
Participant
    ↓
Backend (Express API)
    ↓
RabbitMQ
    ↓
Worker
    ↓
Judge0 + Docker
    ↓
Execution Result
    ↓
Backend
```

Current local HTTP flow:

```text
Browser
  → Nginx (:8080)
      → /api/*  → api:4000
      → /*      → frontend:3000
```

Service boundaries:

- **Frontend** is the unified Next.js application (`apps/frontend`) at `/`, `/admin/*`, and `/client/*`.
- **API** is a separate Express.js service (does not execute user code).
- **Worker** is a separate Node.js service that consumes RabbitMQ execution jobs (Judge0 arrives in M7).
- **PostgreSQL** and **RabbitMQ** provide approved infrastructure.
- **Nginx** is the local HTTP entry point.
- **Judge0** is deferred (directory present; Compose service commented out).
- `apps/admin` and `apps/client` remain as Milestone 0 source skeletons and are **not** deployed.

## Docker architecture

```text
Browser
  → Nginx (:8080 host → :80 container)
      → /api/*     → api:4000
      → /*         → frontend:3000
      → /ws        → prepared (not implemented)

postgres (volume: codearena_postgres_data)
rabbitmq + management UI
worker (RabbitMQ execution consumer)
```

All Compose operations use project name `codearena`:

```bash
docker compose -p codearena -f docker-compose.yml
```

Judge0 is **not** started in Milestone 0.

## Repository structure

```text
CodeArena/
├── apps/
│   ├── frontend/       Official Next.js UI (login, /admin, /client)
│   ├── admin/          Milestone 0 skeleton (not deployed)
│   └── client/         Milestone 0 skeleton (not deployed)
├── services/
│   ├── api/            Express.js backend
│   └── worker/         Node.js Worker (execution consumer)
├── packages/
│   ├── messaging/      Shared RabbitMQ messaging (API + Worker)
│   ├── shared/         Shared utilities placeholder
│   ├── types/          Shared constants placeholder
│   └── config/         Shared config placeholder
├── infrastructure/
│   ├── nginx/          Nginx reverse-proxy config
│   ├── postgres/       Reserved (API owns migrations)
│   ├── rabbitmq/       Reserved for future queue config
│   └── judge0/         Deferred Judge0 integration
├── scripts/            Developer helper scripts
├── Makefile            Primary developer interface
├── common.mk           Shared Make configuration
├── docker-compose.yml  Local orchestration
├── .env.example        Environment template
└── .nvmrc              Node.js 24 pin
```

## Prerequisites

| Requirement | Notes |
| ----------- | ----- |
| Windows + WSL2 | Develop inside Ubuntu 24.04 |
| Project location | Keep the repo on `D:\CodeArena` → `/mnt/d/CodeArena` |
| Docker Desktop | Enable WSL2 integration for your Ubuntu distro |
| GNU Make | Use Make targets for build/up/down/logs/health |
| Node.js 24 | Pinned in `.nvmrc` and Docker images (`node:24-alpine`) |

Do **not** use Node 20, 22, or 26 for this project.

Node is used inside containers for app/services. Host Node 24 (via nvm) is optional for local editing; Docker remains the runtime source of truth.

## WSL development environment

Intended local workflow:

```text
Windows
    ↓
WSL Ubuntu 24.04
    ↓
/mnt/d/CodeArena   (physical path: D:\CodeArena)
    ↓
Docker CLI (inside WSL)
    ↓
Docker Desktop (WSL2 backend)
```

Run all Make and Docker commands from WSL in `/mnt/d/CodeArena`.

## Environment setup

1. Copy the template:

```bash
cp .env.example .env
```

Or run:

```bash
make setup
```

2. `.env` is gitignored. Only `.env.example` is committed.

Key variables:

| Variable | Purpose |
| -------- | ------- |
| `POSTGRES_*` | PostgreSQL container name/user/password/port |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | API client connection (Compose sets `DB_HOST=postgres` inside the api container) |
| `DB_POOL_MIN` / `DB_POOL_MAX` / `DB_IDLE_TIMEOUT_MS` / `DB_CONNECTION_TIMEOUT_MS` | API connection pool |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | API JWT signing (required; never commit a real secret) |
| `RABBITMQ_HOST` / `RABBITMQ_PORT` / `RABBITMQ_USER` / `RABBITMQ_PASSWORD` / `RABBITMQ_VHOST` | Broker connection. Compose sets `RABBITMQ_HOST=rabbitmq` for api and worker |
| `RABBITMQ_URL` | Optional AMQP URL override. Leave unset to use the variables above |
| `RABBITMQ_CONSUMER_ENABLED` | Worker: when `true` (default), consume `codearena.execution`. API Compose sets this `false` (producer-only) |
| `RABBITMQ_RECONNECT_ENABLED` | Worker runtime reconnect. Compose enables it for worker |
| `CODEARENA_SERVICE_NAME` | Messaging log prefix / AMQP `appId` (`api` or `worker`) |
| `API_PORT` / `WORKER_PORT` | Host port bindings (API and Worker health; UI is Nginx only) |
| `NGINX_PORT` | Local entry port (default `8080`) |

Never commit real secrets.

## Port mapping

Host ports map into container ports. Prefer changing **host** bindings in `.env` if another local project already uses a port.

| Host port (default) | Container port | Service |
| ------------------- | -------------- | ------- |
| `8080` (`NGINX_PORT`) | `80` | Nginx entry (UI + `/api`) |
| `4000` (`API_PORT`) | `4000` | API (direct) |
| `4001` (`WORKER_PORT`) | `4001` | Worker health (direct) |
| `5432` (`POSTGRES_PORT`) | `5432` | PostgreSQL |
| `5672` (`RABBITMQ_PORT`) | `5672` | RabbitMQ AMQP |
| `15672` (`RABBITMQ_MANAGEMENT_PORT`) | `15672` | RabbitMQ management UI |

Prefer Nginx (`http://localhost:8080`) for application access.

## Port isolation

CodeArena may share a machine with other Docker Compose projects (for example PhishSheriff). Isolation is intentional:

- Compose project name: `codearena` (`-p codearena`)
- Container names prefixed with `codearena-`
- Network: `codearena-network`
- Named volumes: `codearena_postgres_data`, `codearena_rabbitmq_data`
- Make targets namespaced with `-codearena`

## CodeArena-specific Make commands

Docker lifecycle targets are explicitly namespaced so they cannot be confused with another local project's Make commands.

| Command | Description |
| ------- | ----------- |
| `make help` | List targets and recommended workflow |
| `make setup` | Create `.env` from `.env.example` if missing |
| `make docker-build-codearena` | Build CodeArena images |
| `make docker-up-codearena` | Start the CodeArena stack |
| `make docker-down-codearena` | Stop the CodeArena stack |
| `make docker-restart-codearena` | Restart CodeArena services |
| `make docker-ps-codearena` | Show CodeArena status |
| `make docker-logs-codearena` | Follow all CodeArena logs |
| `make docker-logs-api-codearena` | Follow API logs |
| `make docker-logs-worker-codearena` | Follow worker logs |
| `make docker-logs-frontend-codearena` | Follow frontend logs |
| `make docker-health-codearena` | Check HTTP and container health (read-only) |
| `make docker-clean-codearena` | Stop stack and remove orphans |
| `make test` | Run API + Worker unit tests (no PostgreSQL or RabbitMQ required) |
| `make test-codearena` | Run API + Worker unit + PostgreSQL + RabbitMQ integration tests |
| `make db-test-codearena` | Run PostgreSQL and RabbitMQ integration tests |
| `make db-migrate-codearena` | Apply pending API migrations in the api container |
| `make lint` | Placeholder |
| `make format` | Placeholder |

Ambiguous legacy targets such as `make build`, `make up`, `make down`, `make health`, and `make logs` were removed. Use the `-codearena` namespaced commands instead.

## Build workflow

```bash
cd /mnt/d/CodeArena
make setup
make docker-build-codearena
```

## Start workflow

```bash
make docker-up-codearena
make docker-ps-codearena
```

## Health check workflow

```bash
make docker-health-codearena
```

This runs `scripts/healthcheck.sh` in read-only mode. It does not start, stop, or modify containers.

Manual checks (defaults; override via `.env`):

```bash
curl -s http://localhost:8080/health
curl -s http://localhost:8080/
curl -s http://localhost:8080/admin
curl -s http://localhost:8080/client
curl -s http://localhost:8080/api/health
curl -s http://localhost:8080/api/v1/health
curl -s http://localhost:8080/api/v1/health/db
curl -s http://localhost:4001/health
```

RabbitMQ management UI: `http://localhost:15672` (credentials from `.env`).

Expected result when the stack is healthy:

```text
Passed: 13  Failed: 0
```

## Shutdown workflow

```bash
make docker-down-codearena
make docker-ps-codearena
```

This stops only the `codearena` Compose project. Other Docker projects on the machine remain untouched.

## Quick start

```bash
cd /mnt/d/CodeArena
make setup
make docker-build-codearena
make docker-up-codearena
make docker-ps-codearena
make docker-health-codearena
make docker-logs-codearena
make docker-down-codearena
```

## Services

| Service | Role | Current behavior |
| ------- | ---- | -------------------- |
| `nginx` | Reverse proxy entry | Routes `/api/*` to the API and `/*` to the frontend; `/ws` stub |
| `frontend` | Unified Next.js UI | Login, `/admin/*`, `/client/*` via Nginx `:8080` |
| `api` | Express backend | M6: health, DB, auth, admin/student APIs, RabbitMQ **producer** (no execution consumer) |
| `worker` | Worker process | M6: consumes `codearena.execution`, job processor boundary, graceful shutdown, reconnect |
| `postgres` | Database | Application database; API-owned migrations |
| `rabbitmq` | Message broker | Shared topology: events exchange, system + execution queues, DLX/DLQs |
| `judge0` | Execution engine | Deferred / commented out |

## Troubleshooting

**Docker Engine not reachable**  
Start Docker Desktop and confirm WSL integration is enabled for Ubuntu.

**Port already in use**  
Change host ports in `.env` (for example `NGINX_PORT`), then:

```bash
make docker-down-codearena
make docker-up-codearena
```

Do not change another project's ports to free CodeArena.

**Next.js containers unhealthy on first boot**  
Wait for the healthcheck `start_period`, then rerun `make docker-health-codearena`. Check `make docker-logs-frontend-codearena`.

**Nginx restarting with `host not found in upstream`**  
Frontend is not running. Bring the full stack up with `make docker-up-codearena`.

**Compose credential helper / `docker-credential-desktop.exe` exec format error**  
This is a Docker Desktop / WSL credential helper environment issue, not a CodeArena Dockerfile problem. Fix Docker Desktop WSL integration or credential helper configuration; do not rewrite CodeArena Dockerfiles as a workaround.

**Compose file validation**

```bash
docker compose -f docker-compose.yml config
```

**Permission / path issues on `/mnt/d`**  
Keep the project on `D:\CodeArena` and run Make/Docker from WSL in `/mnt/d/CodeArena`.

## Development rules

From the CodeArena guardrails skill:

- Use Docker and Makefile commands.
- Keep services separated.
- Do not execute user code inside Express.
- Contest submissions must eventually go through RabbitMQ.
- Execution must eventually go through Docker/Judge0.
- Do not create additional README files.
- Do not put secrets in Git.
- Ask before introducing new technologies or changing architecture.

## Current milestone

**Milestone 6 — Worker service**

Shared messaging lives in `packages/messaging` and is used by both API and Worker. The API connects to RabbitMQ as a **producer**, asserts topology (system + execution queues and DLQs), and does **not** consume the execution queue. The Worker connects, asserts the same topology, consumes `codearena.execution` bound to `codearena.execution.requested`, validates the M5 envelope plus the M6 execution payload (`jobId` required), runs the job processor boundary, and ACK/rejects (DLQ) according to the shared consumer. Worker runtime reconnect uses bounded exponential backoff. Judge0 is not implemented.

Message type added in M6: `codearena.execution.requested`. System probe type `codearena.system.test` remains for infrastructure tests only.

No contest, submission, Judge0, or notification domain work. No new database tables.

HTTP behavior from Milestone 4 is unchanged:

- Existing `POST /api/auth/register`, `POST /api/auth/login`, and `GET /api/auth/me` are unchanged
- Public registration still always creates `STUDENT`. A fresh database also seeds one default ADMIN via migration `003` (`admin@codearena.com` / `Admin@123`). The seed is idempotent and does not overwrite an existing account. Change this password before any non-local deployment. There is still no public ADMIN registration endpoint.
- There is **no** separate `POST /api/admin/login` or `POST /api/student/login` — both apps use `/api/auth/login`
- There is **no** `GET /api/app/me` — `GET /api/auth/me` already returns the authenticated identity `{ id, email, role }`
- `GET /api/admin/me` and `GET /api/admin/dashboard` require Bearer JWT + `ADMIN`
- `GET /api/student/me` and `GET /api/student/dashboard` require Bearer JWT + `STUDENT`
- Wrong role returns `403`; missing or invalid JWT returns `401`
- Role is taken from the server-side user record, never from request body/query/headers
- Dashboard responses are foundation metadata only (`status: "ready"`). They do not invent contest, problem, or submission counts
- No new database tables or migrations in M4

Nginx already strips `/api`, so Express serves `/admin/...` and `/student/...`. Versioned aliases exist at `/v1/admin/*` and `/v1/student/*`.

### Access matrix

| Endpoint | ADMIN | STUDENT | Unauthenticated |
| -------- | ----- | ------- | --------------- |
| `GET /api/auth/me` | 200 | 200 | 401 |
| `GET /api/admin/me` | 200 | 403 | 401 |
| `GET /api/admin/dashboard` | 200 | 403 | 401 |
| `GET /api/student/me` | 403 | 200 | 401 |
| `GET /api/student/dashboard` | 403 | 200 | 401 |

### Database configuration

Copy `.env.example` to `.env` (never commit `.env`). The API reads:

| Variable | Default | Notes |
| -------- | ------- | ----- |
| `DB_HOST` | `localhost` | Compose overrides to `postgres` |
| `DB_PORT` | `5432` | |
| `DB_NAME` | `codearena` | Same as `POSTGRES_DB` |
| `DB_USER` | required | Same as `POSTGRES_USER` |
| `DB_PASSWORD` | required | Same as `POSTGRES_PASSWORD` |
| `DB_POOL_MIN` | `0` | Pre-warmed connections (pg has no native min) |
| `DB_POOL_MAX` | `10` | |
| `DB_IDLE_TIMEOUT_MS` | `10000` | |
| `DB_CONNECTION_TIMEOUT_MS` | `2000` | |
| `JWT_SECRET` | required | At least 32 characters; do not use the example placeholder in production |
| `JWT_EXPIRES_IN` | `1h` | Passed to `jsonwebtoken` (for example `1h`, `8h`) |
| `RABBITMQ_HOST` | `localhost` | Compose overrides to `rabbitmq` inside api and worker |
| `RABBITMQ_PORT` | `5672` | AMQP port |
| `RABBITMQ_USER` / `RABBITMQ_PASSWORD` | required unless `RABBITMQ_URL` is set | Same values as the RabbitMQ container |
| `RABBITMQ_VHOST` | `/` | |
| `RABBITMQ_URL` | unset | Optional override of the assembled AMQP URL |
| `RABBITMQ_CONSUMER_ENABLED` | `true` | Worker consumption switch. API Compose sets `false` |
| `RABBITMQ_RECONNECT_ENABLED` | `false` (host default) | Worker Compose sets `true` |
| `CODEARENA_SERVICE_NAME` | `api` / `worker` | Messaging identity |

Do not use `localhost` for container-to-container access; the api service must use the Compose hostname `postgres`.

### Migrations

Migrations live in `services/api/src/migrations/` and run automatically when the API process starts. They are versioned, checksummed, and recorded in `schema_migrations`. Re-running them is a no-op for already-applied versions. Never edit an already-applied migration; add a new file instead. Migration `003` seeds one default ADMIN (`admin@codearena.com`) when that email is not already present; it does not add tables.

```bash
make db-migrate-codearena
```

Or from the API package (host must reach PostgreSQL on `DB_HOST`):

```bash
cd services/api && npm run migrate
```

### Authentication (Milestone 3, preserved)

| Method | External path | Express path | Auth |
| ------ | ------------- | ------------ | ---- |
| `POST` | `/api/auth/register` | `/auth/register` | Public; always `STUDENT` |
| `POST` | `/api/auth/login` | `/auth/login` | Public |
| `GET` | `/api/auth/me` | `/auth/me` | Bearer JWT |

Register/login body: `{ "email": "...", "password": "..." }`. Password minimum length is 8. Email is trimmed and lowercased. Duplicate email returns `409`. Invalid credentials return `401` with `Invalid email or password`.

### Application APIs (Milestone 4)

| Method | External path | Express path | Auth |
| ------ | ------------- | ------------ | ---- |
| `GET` | `/api/admin/me` | `/admin/me` | Bearer JWT + `ADMIN` |
| `GET` | `/api/admin/dashboard` | `/admin/dashboard` | Bearer JWT + `ADMIN` |
| `GET` | `/api/student/me` | `/student/me` | Bearer JWT + `STUDENT` |
| `GET` | `/api/student/dashboard` | `/student/dashboard` | Bearer JWT + `STUDENT` |

Send `Authorization: Bearer <token>` from `POST /api/auth/login`. Do not send a client-chosen role.

- Frontend login UI is served at `http://localhost:8080`. Contest/problem/submission screens remain mock until later milestones.

### Test commands

```bash
make test                 # API + Worker unit tests (no PostgreSQL, no RabbitMQ)
make db-test-codearena    # integration tests against PostgreSQL and RabbitMQ
make test-codearena       # unit + integration
```

Integration tests require the Compose `postgres` and `rabbitmq` services. They fail clearly if either is not available; they are not skipped. Messaging and Worker tests publish and consume against the real broker; they are not mock-only.

See `MileStone-doc.md` for the full roadmap.

## Future milestones

Planned next (see `MileStone-doc.md`):

- Milestone 7: Judge0 adapter behind the Worker job processor
- Contests, submissions, WebSockets, and retry/replay remain later milestones
