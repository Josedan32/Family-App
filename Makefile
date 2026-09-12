.PHONY: db api-dev web-dev test migrate seed lint api-types

# Raw: docker compose up -d db
db:
	docker compose up -d db

# Raw: cd apps/api && uvicorn family_api.main:app --reload --port 8001
api-dev:
	cd apps/api && uvicorn family_api.main:app --reload --port 8001

# Raw: cd apps/api && pytest -v
test:
	cd apps/api && pytest -v

# Raw: cd apps/api && alembic upgrade head
migrate:
	cd apps/api && alembic upgrade head

# Raw: cd apps/api && python scripts/seed.py
seed:
	cd apps/api && python scripts/seed.py

# Raw: cd apps/api && ruff check . && mypy src
lint:
	cd apps/api && ruff check . && mypy src

# Raw: cd apps/web && npx openapi-typescript http://localhost:8001/openapi.json -o src/lib/api/generated/schema.d.ts
api-types:
	cd apps/web && npx openapi-typescript http://localhost:8001/openapi.json -o src/lib/api/generated/schema.d.ts
