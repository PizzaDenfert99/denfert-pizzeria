# Pizza Denfert — one-word operations for the self-hosted VPS.
#
# Every target is idempotent and safe to re-run. All targets assume you are
# in the repo root and Docker Compose v2 is installed.

.PHONY: help bootstrap up down restart rebuild logs status health \
        backup restore lint config env-check clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

bootstrap: ## First-time VPS setup (Docker install, .env, self-signed certs)
	sudo bash scripts/bootstrap.sh

up: ## Build and start the whole stack in the background
	docker compose up -d --build

down: ## Stop the stack (data volume PRESERVED)
	docker compose down

restart: ## Restart backend + nginx without rebuild (config-only changes)
	docker compose restart backend nginx

rebuild: ## Rebuild backend image and restart it (code change deploy)
	docker compose up -d --build backend

logs: ## Tail logs from all services (Ctrl-C to exit)
	docker compose logs -f --tail=200

status: ## Show service state + resource usage
	docker compose ps
	health: ## Curl the internal healthz endpoint through Nginx
	@curl -fsS -o /dev/null -w "api.pizzadenfert.fr healthz: HTTP %{http_code}\n"      https://api.pizzadenfert.fr/api/healthz     || true
	@curl -fsS -o /dev/null -w "loyalty.pizzadenfert.fr healthz: HTTP %{http_code}\n" https://loyalty.pizzadenfert.fr/api/healthz || true

backup: ## Snapshot MongoDB into ./backups/ (retention: 14)
	sudo bash scripts/backup.sh

restore: ## Restore a backup: make restore FILE=backups/mongo-*.archive.gz
	sudo bash scripts/restore.sh "$(FILE)"

lint: ## Local dev: run backend syntax check
	python3 -m py_compile backend/server.py && echo "backend/server.py OK"

config: ## Validate docker-compose.yml + show resolved config
	docker compose config

env-check: ## Verify .env has all required variables set
	@set -e; \
	for k in DB_NAME JWT_SECRET SUPABASE_URL; do \
	  v=$$(grep -E "^$$k=" .env | cut -d= -f2-); \
	  if [ -z "$$v" ]; then echo "[x] $$k is empty in .env"; exit 1; fi; \
	  echo "[ok] $$k set"; \
	done; \
	sec=$$(grep -E "^JWT_SECRET=" .env | cut -d= -f2-); \
	if [ "$$sec" = "replace-me-with-64-hex-chars" ]; then echo "[x] JWT_SECRET still placeholder"; exit 1; fi

clean: ## Remove images + volumes (DANGEROUS — destroys DB!)
	@printf "This DESTROYS MongoDB data. Type 'yes' to continue: " && read a && [ "$$a" = "yes" ] || exit 1
	docker compose down -v --rmi local
