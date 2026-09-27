# Shared CodeArena Make configuration
# Included by the root Makefile. Keep values environment-agnostic.

PROJECT_NAME    := codearena
COMPOSE_FILE    := docker-compose.yml
NODE_VERSION    := 24

# Compose command (override COMPOSE_FILE for future demo/prod overlays)
COMPOSE         := docker compose -p $(PROJECT_NAME) -f $(COMPOSE_FILE)

# Default local entry (host)
NGINX_URL       := http://localhost:$${NGINX_PORT:-8080}
API_HEALTH_URL  := $(NGINX_URL)/api/health
ADMIN_URL       := $(NGINX_URL)/admin
CLIENT_URL      := $(NGINX_URL)/client

# Services managed by this Compose stack
SERVICES        := nginx frontend api worker postgres rabbitmq
