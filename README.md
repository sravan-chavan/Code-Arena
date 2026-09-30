# CodeArena

CodeArena is a Dockerized coding contest platform. Milestone 0 established the infrastructure skeleton. Milestone 1 built the Express API foundation. Milestone 2 added the PostgreSQL database foundation. Milestone 3 added authentication and RBAC. Milestone 4 added Admin and Participant application API contracts. Milestone 5 added the RabbitMQ messaging architecture. Milestone 6 turned the Worker into a real background consumer of the execution queue. Milestone 7 integrates an external Judge0 CE instance into the Worker. **Milestone 8** adds Practice Mode: standalone practice problems in PostgreSQL that reuse the same RabbitMQ → Worker → Judge0 execution pipeline. The official UI is the unified Next.js app in `apps/frontend`, served through Nginx.

## Architecture overview

Current execution flow (Milestone 7–8):

```text
Admin UI → Create Contest / Add Question → API → PostgreSQL
Student UI → Open Contest / Question → Run/Submit
Student UI → Practice Area → Open Practice Problem → Run/Submit
    ↓
API (persist QUEUED submission, publish codearena.execution.requested)
    ↓
RabbitMQ execution queue
    ↓
Worker → Judge0 (poll) → correctness evaluation
    ↓
RabbitMQ results queue (codearena.execution.completed)
    ↓
API consumer updates submissions
    ↓
Student UI polls GET /student/submissions/:id
          or GET /student/practice/submissions/:id
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
- **Worker** is a separate Node.js service that consumes RabbitMQ execution jobs and runs them on Judge0.
- **PostgreSQL** and **RabbitMQ** provide approved infrastructure.
- **Nginx** is the local HTTP entry point.
- **Judge0** is external for M7 (Compose service remains commented out). The Worker reaches it via `JUDGE0_URL`.
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
worker (RabbitMQ execution consumer → Judge0)
```

All Compose operations use project name `codearena`:

```bash
docker compose -p codearena -f docker-compose.yml
```

Judge0 is **not** started by Compose in Milestone 7. Run Judge0 separately and set `JUDGE0_URL`.

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
| `RABBITMQ_CONSUMER_ENABLED` | Worker: when `true` (default), consume `codearena.execution`. API Compose sets this `false` so the API does not consume the *request* queue. The API still consumes `codearena.execution.results` so the UI can poll Judge0 outcomes |
| `RABBITMQ_RECONNECT_ENABLED` | Worker runtime reconnect. Compose enables it for worker |
| `CODEARENA_SERVICE_NAME` | Messaging log prefix / AMQP `appId` (`api` or `worker`) |
| `JUDGE0_URL` | Worker: base URL of an **external** Judge0 CE instance (required). Compose default is `http://host.docker.internal:2358` |
| `JUDGE0_AUTH_TOKEN` | Worker: Judge0 `X-Auth-Token`. Leave empty when Judge0 auth is disabled |
| `JUDGE0_POLL_INTERVAL_MS` | Worker: delay between GET /submissions/{token} polls (default `1000`) |
| `JUDGE0_MAX_POLL_ATTEMPTS` | Worker: hard cap on polls (default `30`). Exhaustion NACKs the job to the DLQ |
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
| `api` | Express backend | M6/M7: health, DB, auth, admin/student APIs, RabbitMQ **producer** (no execution consumer) |
| `worker` | Worker process | M7: consumes `codearena.execution`, submits to Judge0, polls, maps status, ACK/DLQ |
| `postgres` | Database | Application database; API-owned migrations |
| `rabbitmq` | Message broker | Shared topology: events exchange, system + execution queues, DLX/DLQs |
| `judge0` | Execution engine | External for M7 (Compose service commented out) |

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

**Milestone 7 — Judge0 execution**

The API remains the RabbitMQ **producer**. The Worker consumes `codearena.execution`, validates the M6 envelope plus M7 Judge0 fields (`jobId`, `sourceCode`, `languageId`, optional `stdin` / `expectedOutput` / `cpuTimeLimit` / `memoryLimit`), submits `POST /submissions?base64_encoded=false&wait=false`, polls `GET /submissions/{token}` until a terminal Judge0 status, maps that status into a CodeArena execution result, then returns so the shared consumer **ACKs**. Judge0 HTTP failures, malformed responses, and poll exhaustion **NACK** to the execution DLQ (M6 semantics). Terminal verdicts such as compilation or runtime errors are successful processing (ACK) with a mapped status.

Judge0 stays **outside** Compose. Point `JUDGE0_URL` at a running Judge0 CE instance. An empty `JUDGE0_AUTH_TOKEN` omits the `X-Auth-Token` header.

M7 Judge0 processing is unchanged. Contests, questions, test cases, and submissions are persisted in PostgreSQL (migrations `004`–`006`). The Worker publishes `codearena.execution.completed` after evaluation; the API consumes the results queue and the Student UI polls the submission.

**Milestone 8 — Practice Mode**

Practice problems are stored in the existing `questions` table with `is_practice = TRUE` and `contest_id` NULL. They do not belong to a contest. Practice Run/Submit uses the same M7 execution contract: API persists a `QUEUED` submission, publishes `codearena.execution.requested`, the Worker talks to Judge0, and the API results consumer writes the terminal status. The Student Practice Area loads problems from PostgreSQL and polls real submission state. Judge0 remains external; Compose still does not start it.

Student practice endpoints (Bearer JWT + `STUDENT`):

- `GET /api/student/practice/problems`
- `GET /api/student/practice/problems/:id`
- `POST /api/student/practice/executions`
- `GET /api/student/practice/submissions`
- `GET /api/student/practice/submissions/:id`

Migration `008` seeds three idempotent development practice problems: Hello CodeArena, Sum of Two Numbers, Reverse String. They are separate rows from the contest `Test` seed.

**Milestone 9 — Contest Engine**

Contest management extends the existing `contests` / `questions` tables. It does not add a second contest system or a second execution pipeline. Admin creates a **draft**, then **schedules** it. Effective status is computed from **API server time** and stored UTC `start_time` / `end_time`:

```text
DRAFT → SCHEDULED → RUNNING → ENDED
          ↘ CANCELLED
```

`SCHEDULED → RUNNING` and `RUNNING → ENDED` happen from the clock (lazy-persisted on read/execute). Admin may `POST .../cancel` from draft or scheduled, and `POST .../end` while running. Invalid transitions return `409`.

Students (`STUDENT` JWT only) register while the contest is **scheduled or running**. Duplicate registration is `409`. Arena questions and contest execution require: authenticated student, contest exists and is running, student is registered, and the question belongs to that contest. Practice execution is unchanged and still uses `POST /api/student/practice/executions`.

The development `Test` contest stays a single open-ended running seed (`start_time` and `end_time` remain NULL). Students must register before entering its arena. Migration `009` does not create another Test contest.

Question Library questions stay one row in `questions`. Contest membership is a many-to-many table `contest_questions` (migration `011`). `questions.contest_id` is dropped after backfill so membership cannot diverge.

```text
Practice:   is_practice = true, no contest_questions rows
Unassigned: is_practice = false, no contest_questions rows
Contest:    is_practice = false, one or more contest_questions rows
```

The same question can belong to multiple contests without copying the row. Contest-specific `sort_order` lives on `contest_questions`, not on `questions.sort_order`. Practice questions cannot be attached (API `409` plus a PostgreSQL trigger). Duplicate membership on the same contest is `409`.

Admin creates unassigned questions with `POST /admin/questions` (omit `contestId`) and attaches with `POST /admin/contests/:id/questions/:questionId` or `POST /admin/contests/:id/questions/batch`. Editing a question (`PATCH /admin/questions/:questionId`) updates the shared row, so every contest that references it sees the new content. Test cases stay on `question_test_cases`; the last remaining test case cannot be deleted. There is no question-versioning system in M9: historical submissions keep their stored results and are not rewritten when tests change.

Draft and scheduled contests can be edited (`PATCH /admin/contests/:id`), including timing when the window stays valid. Running contests may change title/description only. Ended and cancelled contests are immutable.

Timestamps: PostgreSQL `TIMESTAMPTZ` and API bodies/responses are ISO-8601 UTC (`2026-09-30T15:00:00.000Z`). The UI converts to the browser locale (for example `8:30 PM IST`). Contest state never uses the browser clock; responses include `serverTime` for countdown display.

### Manual Judge0 execution

Start CodeArena (`make docker-up-codearena`) and a Judge0 CE instance that the Worker can reach via `JUDGE0_URL`. Then publish one job through the API producer path:

```bash
# Host (from services/api so @codearena/messaging resolves)
cd /mnt/d/CodeArena/services/api
node ../../scripts/publish-execution.js
node ../../scripts/publish-execution.js --case compile
node ../../scripts/publish-execution.js --case runtime
node ../../scripts/publish-execution.js --case timeout
```

Or from the API container:

```bash
docker exec -i codearena-api node - < scripts/publish-execution.js
docker exec -i -e EXECUTION_CASE=compile codearena-api node - < scripts/publish-execution.js
```

Watch Worker logs:

```bash
make docker-logs-worker-codearena
```

Expected success (`print("Hello CodeArena")`, Judge0 Python 3 `language_id=71`):

```text
codearenaStatus=ACCEPTED stdoutPreview=Hello CodeArena
```

Override `JUDGE0_LANGUAGE_ID` if your Judge0 build uses a different Python id.

Message type: `codearena.execution.requested`. System probe type `codearena.system.test` remains for infrastructure tests only.

HTTP behavior from Milestone 4 is unchanged for auth:

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
| `GET /api/admin/contests` | 200 | 403 | 401 |
| `POST /api/admin/contests` | 201 | 403 | 401 |
| `GET /api/admin/contests/:id` | 200 | 403 | 401 |
| `PATCH /api/admin/contests/:id` | 200 | 403 | 401 |
| `POST /api/admin/contests/:id/schedule` | 200 | 403 | 401 |
| `POST /api/admin/contests/:id/cancel` | 200 | 403 | 401 |
| `POST /api/admin/contests/:id/end` | 200 | 403 | 401 |
| `GET /api/admin/contests/:id/questions` | 200 | 403 | 401 |
| `POST /api/admin/contests/:id/questions` | 201 | 403 | 401 |
| `POST /api/admin/contests/:id/questions/batch` | 200 | 403 | 401 |
| `POST /api/admin/contests/:id/questions/:questionId` | 200 | 403 | 401 |
| `PATCH /api/admin/contests/:id/questions/order` | 200 | 403 | 401 |
| `GET /api/admin/contests/:id/participants` | 200 | 403 | 401 |
| `GET /api/admin/questions` | 200 | 403 | 401 |
| `POST /api/admin/questions` | 201 | 403 | 401 |
| `GET`/`PATCH /api/admin/questions/:questionId` | 200 | 403 | 401 |
| `GET`/`POST /api/admin/questions/:questionId/test-cases` | 200/201 | 403 | 401 |
| `PATCH`/`DELETE /api/admin/questions/:questionId/test-cases/:testCaseId` | 200 | 403 | 401 |
| `GET /api/student/me` | 403 | 200 | 401 |
| `GET /api/student/dashboard` | 403 | 200 | 401 |
| `GET /api/student/languages` | 403 | 200 | 401 |
| `GET /api/student/contests` | 403 | 200 | 401 |
| `GET /api/student/contests/:id` | 403 | 200 | 401 |
| `POST /api/student/contests/:id/register` | 403 | 201 | 401 |
| `GET /api/student/contests/:id/registration` | 403 | 200 | 401 |
| `GET /api/student/contests/:id/questions` | 403 | 200 | 401 |
| `POST /api/student/executions` | 403 | 202 | 401 |
| `GET /api/student/submissions` | 403 | 200 | 401 |
| `GET /api/student/submissions/:id` | 403 | 200 | 401 |

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
| `JUDGE0_URL` | required | Worker only. External Judge0 CE base URL |
| `JUDGE0_AUTH_TOKEN` | empty | Optional. Omit header when empty |
| `JUDGE0_POLL_INTERVAL_MS` | `1000` | Poll delay |
| `JUDGE0_MAX_POLL_ATTEMPTS` | `30` | Poll cap |

Do not use `localhost` for container-to-container access; the api service must use the Compose hostname `postgres`. The Worker must not use `localhost` for Judge0 when Judge0 runs on the host — use `host.docker.internal` (Compose sets `extra_hosts` for this).

### Migrations

Migrations live in `services/api/src/migrations/` and run automatically when the API process starts. They are versioned, checksummed, and recorded in `schema_migrations`. Re-running them is a no-op for already-applied versions. Never edit an already-applied migration; add a new file instead.

- `003` seeds one default ADMIN (`admin@codearena.com`) when that email is not already present; it does not add tables.
- `004` creates `contests`, `questions`, `question_test_cases`, and `submissions`.
- `005` idempotently seeds a development contest titled exactly `Test` (not a substitute for Admin Create Contest).
- `006` keeps that Test contest open for local execution (clears `start_time` so the UI timer does not expire).
- `007`–`008` add practice questions (nullable `contest_id`, `is_practice`) and seed three practice problems.
- `009` adds `contests.end_time`, allows `cancelled` status, and creates `contest_participants` with `UNIQUE (contest_id, user_id)`. It backfills `end_time` only where `start_time` is already set; the Test seed stays open-ended.
- `010` relaxes the practice XOR check so unassigned library questions can exist (`contest_id` NULL and `is_practice` FALSE). Practice and contest rows are unchanged.
- `011` creates `contest_questions`, copies existing contest assignments and `sort_order`, adds a trigger that rejects practice membership, then drops `questions.contest_id`.

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
| `GET`/`POST` | `/api/admin/contests` | `/admin/contests` | Bearer JWT + `ADMIN` |
| `GET`/`PATCH` | `/api/admin/contests/:id` | `/admin/contests/:id` | Bearer JWT + `ADMIN` |
| `POST` | `/api/admin/contests/:id/schedule` | `/admin/contests/:id/schedule` | Bearer JWT + `ADMIN` |
| `POST` | `/api/admin/contests/:id/cancel` | `/admin/contests/:id/cancel` | Bearer JWT + `ADMIN` |
| `POST` | `/api/admin/contests/:id/end` | `/admin/contests/:id/end` | Bearer JWT + `ADMIN` |
| `GET`/`POST` | `/api/admin/contests/:id/questions` | `/admin/contests/:id/questions` | Bearer JWT + `ADMIN` |
| `POST` | `/api/admin/contests/:id/questions/batch` | `/admin/contests/:id/questions/batch` | Bearer JWT + `ADMIN` |
| `POST` | `/api/admin/contests/:id/questions/:questionId` | `/admin/contests/:id/questions/:questionId` | Bearer JWT + `ADMIN` |
| `PATCH` | `/api/admin/contests/:id/questions/order` | `/admin/contests/:id/questions/order` | Bearer JWT + `ADMIN` |
| `GET` | `/api/admin/contests/:id/participants` | `/admin/contests/:id/participants` | Bearer JWT + `ADMIN` |
| `GET`/`POST` | `/api/admin/questions` | `/admin/questions` | Bearer JWT + `ADMIN` |
| `GET`/`PATCH` | `/api/admin/questions/:questionId` | `/admin/questions/:questionId` | Bearer JWT + `ADMIN` |
| `GET`/`POST` | `/api/admin/questions/:questionId/test-cases` | `/admin/questions/:questionId/test-cases` | Bearer JWT + `ADMIN` |
| `PATCH`/`DELETE` | `/api/admin/questions/:questionId/test-cases/:testCaseId` | `/admin/questions/:questionId/test-cases/:testCaseId` | Bearer JWT + `ADMIN` |
| `GET` | `/api/student/contests` | `/student/contests` | Bearer JWT + `STUDENT` |
| `POST` | `/api/student/contests/:id/register` | `/student/contests/:id/register` | Bearer JWT + `STUDENT` |
| `GET` | `/api/student/contests/:id/registration` | `/student/contests/:id/registration` | Bearer JWT + `STUDENT` |
| `POST` | `/api/student/executions` | `/student/executions` | Bearer JWT + `STUDENT` (202 + poll `GET /student/submissions/:id`) |

Send `Authorization: Bearer <token>` from `POST /api/auth/login`. Do not send a client-chosen role.

- Frontend login UI is served at `http://localhost:8080`. Contest, practice, and submission screens use the live Student/Admin APIs. Real Judge0 results still require a reachable Judge0 instance.

Planned next (see `MileStone-doc.md`):

- Contest evaluation / scoring (Milestone 10)
- WebSockets, retry/replay, and later operational features remain later milestones

### Test commands

```bash
make test                 # API + Worker unit tests (no PostgreSQL, no RabbitMQ)
make db-test-codearena    # integration tests against PostgreSQL and RabbitMQ
make test-codearena       # unit + integration
```

Integration tests require the Compose `postgres` and `rabbitmq` services. They fail clearly if either is not available; they are not skipped. Messaging and Worker tests publish and consume against the real broker; they are not mock-only.

See `MileStone-doc.md` for the full roadmap.
