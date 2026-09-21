#!/usr/bin/env bash
# Read-only health verification for the local CodeArena stack.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

NGINX_PORT="${NGINX_PORT:-8080}"
BASE="http://localhost:${NGINX_PORT}"
COMPOSE="docker compose -p codearena -f docker-compose.yml"

pass=0
fail=0

check_http() {
  local name="$1"
  local url="$2"
  local code
  code=$(curl -s -o /tmp/codearena_health_body -w "%{http_code}" "$url" || true)
  if [ "$code" = "200" ]; then
    echo "OK   $name ($url) -> $code"
    pass=$((pass + 1))
  else
    echo "FAIL $name ($url) -> HTTP $code"
    fail=$((fail + 1))
  fi
}

check_compose_health() {
  local service="$1"
  local status
  status=$($COMPOSE ps --format json "$service" 2>/dev/null | head -1 || true)
  if echo "$status" | grep -qi '"Health":"healthy"'; then
    echo "OK   compose:$service healthy"
    pass=$((pass + 1))
  elif $COMPOSE ps "$service" 2>/dev/null | grep -qi "healthy"; then
    echo "OK   compose:$service healthy"
    pass=$((pass + 1))
  else
    # Fallback: inspect container health
    local cid
    cid=$($COMPOSE ps -q "$service" 2>/dev/null || true)
    if [ -n "$cid" ]; then
      local h
      h=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo "unknown")
      if [ "$h" = "healthy" ]; then
        echo "OK   compose:$service healthy"
        pass=$((pass + 1))
      else
        echo "FAIL compose:$service health=$h"
        fail=$((fail + 1))
      fi
    else
      echo "FAIL compose:$service not running"
      fail=$((fail + 1))
    fi
  fi
}

echo "CodeArena health checks"
echo "======================="

check_http "nginx"        "${BASE}/health"
check_http "api via nginx" "${BASE}/api/health"
check_http "api v1 via nginx" "${BASE}/api/v1/health"
check_http "api db via nginx" "${BASE}/api/v1/health/db"
check_http "admin"        "${BASE}/admin/health"
check_http "client"       "${BASE}/client/health"
check_http "worker direct" "http://localhost:${WORKER_PORT:-4001}/health"

check_compose_health "postgres"
check_compose_health "rabbitmq"
check_compose_health "api"
check_compose_health "worker"

echo "======================="
echo "Passed: $pass  Failed: $fail"

if [ "$fail" -gt 0 ]; then
  exit 1
fi

echo "All health checks passed."
