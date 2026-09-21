include common.mk

.DEFAULT_GOAL := help

.PHONY: help setup ensure-env \
	docker-build-codearena docker-up-codearena docker-down-codearena \
	docker-restart-codearena docker-ps-codearena docker-health-codearena \
	docker-logs-codearena docker-clean-codearena \
	docker-logs-api-codearena docker-logs-worker-codearena \
	docker-logs-admin-codearena docker-logs-client-codearena \
	test lint format

help: ## Show available targets
	@echo "CodeArena Make targets"
	@echo ""
	@echo "Recommended workflow:"
	@echo "  make setup"
	@echo "  make docker-build-codearena"
	@echo "  make docker-up-codearena"
	@echo "  make docker-health-codearena"
	@echo "  make docker-down-codearena"
	@echo ""
	@echo "All targets:"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-32s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

ensure-env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env from .env.example"; \
	fi

setup: ensure-env ## Prepare local environment (.env from example)
	@echo "Setup complete. Next: make docker-build-codearena && make docker-up-codearena"

docker-build-codearena: ensure-env ## Build CodeArena Docker images
	$(COMPOSE) build

docker-up-codearena: ensure-env ## Start the CodeArena stack
	$(COMPOSE) up -d

docker-down-codearena: ## Stop the CodeArena stack
	$(COMPOSE) down

docker-restart-codearena: ## Restart the CodeArena stack
	$(COMPOSE) restart

docker-ps-codearena: ## Show CodeArena service status
	$(COMPOSE) ps

docker-health-codearena: ensure-env ## Verify CodeArena health (read-only)
	@bash scripts/healthcheck.sh

docker-logs-codearena: ## Follow all CodeArena service logs
	$(COMPOSE) logs -f

docker-logs-api-codearena: ## Follow CodeArena API logs
	$(COMPOSE) logs -f api

docker-logs-worker-codearena: ## Follow CodeArena worker logs
	$(COMPOSE) logs -f worker

docker-logs-admin-codearena: ## Follow CodeArena admin logs
	$(COMPOSE) logs -f admin

docker-logs-client-codearena: ## Follow CodeArena client logs
	$(COMPOSE) logs -f client

docker-clean-codearena: ## Stop CodeArena and remove Compose orphans (keeps named volumes)
	$(COMPOSE) down --remove-orphans

test: ## Run API unit/integration tests (Milestone 1)
	@cd services/api && npm test

lint: ## Run lint (none defined in Milestone 0)
	@echo "No lint targets defined yet (Milestone 0 foundation)."

format: ## Run format (none defined in Milestone 0)
	@echo "No format targets defined yet (Milestone 0 foundation)."
