.PHONY: help install install-backend install-frontend dev test test-backend test-frontend lint build clean

help:
	@echo "TraderDiary dev targets"
	@echo "  make install         install backend + frontend deps"
	@echo "  make install-backend install only backend deps (venv + pip)"
	@echo "  make install-frontend install only frontend deps (npm)"
	@echo "  make dev             print the two-terminal dev workflow"
	@echo "  make test            run backend + frontend tests"
	@echo "  make test-backend    pytest only"
	@echo "  make test-frontend   vitest only"
	@echo "  make lint            run frontend ESLint"
	@echo "  make build           production build (Windows: build.bat)"
	@echo "  make clean           remove __pycache__, node_modules, dist"

install: install-backend install-frontend

install-backend:
	cd backend && python -m venv venv && \
		. venv/Scripts/activate && \
		pip install -r requirements.txt && \
		pip install -r requirements-dev.txt

install-frontend:
	cd frontend && npm install

dev:
	@echo "Open two terminals:"
	@echo "  Terminal 1: cd backend && . venv/Scripts/activate && python run.py"
	@echo "  Terminal 2: cd frontend && npm run dev"
	@echo "Then open http://localhost:3000"

test: test-backend test-frontend

test-backend:
	cd backend && . venv/Scripts/activate && pytest -v

test-frontend:
	cd frontend && npm test

lint:
	cd frontend && npm run lint

build:
	./build.bat

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/node_modules frontend/.next frontend/out
	rm -rf backend/dist backend/build
