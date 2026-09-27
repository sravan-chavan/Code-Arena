# Running the CodeArena frontend

The official integrated UI is **not** this directory's Compose file.
Use the repository root:

```bash
cp .env.example .env    # from the repo root, if needed
make docker-build-codearena
make docker-up-codearena
```

Then open:

```text
http://localhost:8080
```

Nginx serves the Next.js app at `/` (including `/admin` and `/client`) and
proxies `/api/*` to Express. Browser JavaScript calls same-origin `/api`
(for example `POST http://localhost:8080/api/auth/login`).

Do not point the browser at:

```text
http://localhost:3000
http://nginx:8080/api
http://api:4000
```

## Isolated UI work (not the official stack)

```bash
npm install
npm run dev
```

`next dev` binds to port 3000 for local UI iteration only. API calls still
use `/api`, which only works when the page origin is Nginx (`:8080`). Use
the root Docker stack for authentication and application-API testing.

## Notes

* JWT is stored in `localStorage` and sent as `Authorization: Bearer <token>`.
* Session restore uses `GET /api/auth/me`. Logout clears the token locally.
* After login the app also calls the M4 application APIs:
  `GET /api/admin/me`, `GET /api/admin/dashboard` or
  `GET /api/student/me`, `GET /api/student/dashboard`.
* Route protection is UX only. Backend RBAC remains authoritative.
* Contest/question/submission screens still use `lib/mockData.js` until
  those backend APIs exist.
