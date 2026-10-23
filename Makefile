include common.mk

.DEFAULT_GOAL := help

.PHONY: help setup ensure-env \
	docker-build-codearena docker-up-codearena docker-down-codearena \
	docker-restart-codearena docker-ps-codearena docker-health-codearena \
	docker-logs-codearena docker-clean-codearena \
	docker-logs-api-codearena docker-logs-worker-codearena \
	docker-logs-frontend-codearena \
	test test-codearena db-test-codearena db-migrate-codearena e2e-codearena \
	lint format

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

docker-build-codearena: ensure-env ## Build local CodeArena images (Judge0 images are prebuilt)
	$(COMPOSE) build

docker-up-codearena: ensure-env ## Start CodeArena, including Judge0 and its database and Redis
	@docker volume inspect judge0_data >/dev/null 2>&1 || docker volume create judge0_data
	$(COMPOSE) up -d --remove-orphans

docker-down-codearena: ## Stop CodeArena and Judge0 (keeps named volumes)
	$(COMPOSE) down

docker-restart-codearena: ## Restart CodeArena and Judge0
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

docker-logs-frontend-codearena: ## Follow CodeArena frontend logs
	$(COMPOSE) logs -f frontend

docker-clean-codearena: ## Stop CodeArena and remove Compose orphans (keeps named volumes)
	$(COMPOSE) down --remove-orphans

test: ## Run API + Worker + frontend unit tests (no PostgreSQL/RabbitMQ required)
	@cd services/api && npm test
	@cd services/worker && npm test
	@cd apps/frontend && node --test lib/controlledPoll.test.js lib/httpCache.test.js lib/authValidation.test.js lib/contestActions.test.js lib/arenaProctoring.test.js

test-codearena: ## Run API + Worker unit + PostgreSQL + RabbitMQ integration tests
	@cd services/api && npm run test:all
	@cd services/worker && npm test
	@echo "Stopping Compose Worker so host-side Worker tests own codearena.execution"
	@$(COMPOSE) stop worker
	@cd services/worker && npm run test:db; status=$$?; \
		$(COMPOSE) start worker; \
		exit $$status

db-test-codearena: ## Run PostgreSQL and RabbitMQ integration tests (requires the CodeArena stack)
	@cd services/api && npm run test:db
	@echo "Stopping Compose Worker so host-side Worker tests own codearena.execution"
	@$(COMPOSE) stop worker
	@cd services/worker && npm run test:db; status=$$?; \
		$(COMPOSE) start worker; \
		exit $$status

db-migrate-codearena: ensure-env ## Apply pending API migrations in the running api container
	$(COMPOSE) exec api node src/db/migrate.js

e2e-codearena: ## Browser E2E against Nginx :8080 (requires docker-up-codearena)
	@cd apps/frontend && npx playwright test

lint: ## Run lint (none defined in Milestone 0)
	@echo "No lint targets defined yet (Milestone 0 foundation)."

format: ## Run format (none defined in Milestone 0)
	@echo "No format targets defined yet (Milestone 0 foundation)."
