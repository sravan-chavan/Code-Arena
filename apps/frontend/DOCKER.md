# Running CodeArena Frontend in Docker

This app talks to the backend **through Nginx**, never directly to Express (`:4000`).
Set the backend URL as `http://<host>:8080/api`.

## Quick start (backend running on your host machine)

```bash
cp .env.example .env
# edit .env if your backend port isn't 8080

docker compose up --build
```

Frontend will be available at http://localhost:3000.

Because `NEXT_PUBLIC_API_URL` is compiled into the client bundle at build
time, any change to it requires a rebuild:

```bash
docker compose build --no-cache frontend
docker compose up -d
```

## If the backend is also dockerized

Put both stacks on the same Docker network so the frontend can resolve the
backend's Nginx service by name instead of `host.docker.internal`:

```bash
docker network create codearena-net   # once, if not already created by either stack
```

In `docker-compose.yml`:

```yaml
networks:
  codearena-net:
    external: true
    name: codearena-net
```

And set:

```bash
NEXT_PUBLIC_API_URL=http://<nginx-service-name>:8080/api
```

(replace `<nginx-service-name>` with whatever the backend's Nginx container
is called in its compose file).

## Without Docker (local dev)

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

## Notes

* JWT is stored in `localStorage` on the client and sent as
  `Authorization: Bearer <token>` on every API call via `lib/apiClient.js`.
* `lib/AuthContext.js` restores the session on page load via
  `GET /api/auth/me`, and logs out by simply clearing the token
  (there's no server-side session per the backend contract).
* Route protection (`app/admin/layout.js`, `app/client/layout.js`) mirrors
  the backend's role checks for UX only — the backend remains the real
  authorization boundary.
* Contest/question/submission pages still use `lib/mockData.js` — those
  backend APIs (M8–M10) don't exist yet per the integration guide. Swap
  them for real `api.get(...)` calls once those endpoints land.
