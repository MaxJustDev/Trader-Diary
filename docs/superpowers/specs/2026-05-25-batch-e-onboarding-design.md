# Batch E — Onboarding / Developer Experience

**Date**: 2026-05-25
**Status**: Approved for implementation
**Scope**: Documentation + dev tooling — README rewrite, ARCHITECTURE doc, CONTRIBUTING, .env.example, optional Makefile
**Prereq**: None (docs-only; orthogonal to A/B/C/D)

## Goal

Someone unfamiliar with the project should be able to clone, set up, and run TraderDiary in < 15 minutes by reading top-of-repo docs. Architecture diagrams should make file purposes obvious without grepping. Common dev commands should be one-step.

## Non-Goals

- Translation of the existing Vietnamese-language docs (Start.md, Template_Propfirm.md, PlanofPropfirm.md, QT_Funded_Account_Rules.md) — those stay
- API reference auto-generation (FastAPI Swagger at /docs already covers it)
- Tutorial videos / GIFs
- A dedicated documentation website

## Problems Being Solved

| # | Location | Problem |
|---|----------|---------|
| 1 | `README.md` | Decent already but predates Batches A/B/C/D. Missing: tests command, mention of new modules (config.py, services/mt5_streaming.py, etc.), tighter quickstart. No bilingual entry point. |
| 2 | (none — file does not exist) | No `ARCHITECTURE.md`. Newcomer must map the codebase mentally from CLAUDE.md or by reading code. |
| 3 | (none) | No `CONTRIBUTING.md`. Branching strategy, commit convention, test approach — undocumented. |
| 4 | `backend/.env` (gitignored, generated on first run) | No `.env.example` committed. Newcomer doesn't know what env vars exist. |
| 5 | Shell commands scattered across README + CLAUDE.md | No single `make` / `justfile` entry point for the common dev commands. |

## Solution

### 1. README rewrite

Same coverage as current README, plus:
- 5-minute quickstart for both Windows portable and dev-from-source flows
- Test command (`cd backend && pytest -v`, `cd frontend && npm test`)
- Link to `ARCHITECTURE.md` and `CONTRIBUTING.md`
- Reference to the design docs under `docs/superpowers/specs/` for the curious
- Short bilingual TOC entry pointing to `docs/vi/README.md` (a thin Vietnamese summary that links back to the main README for full instructions)

Keep ASCII tree, prerequisites, run instructions. Drop nothing essential.

### 2. ARCHITECTURE.md

Single page covering:
- Two-process model (FastAPI port 8001 + Next.js port 3000 in dev; combined static bundle in prod)
- Data flow: user → Next.js page → ApiClient → FastAPI route → services (mt5_*, position_sizer, rule_checker) → MT5 lib + SQLite
- WebSocket stream: layout-level `StreamProvider` → `useMT5Stream` hook → Zustand store → memoized components
- Encryption boundary: passwords encrypted with Fernet (key in `.env`), decrypted only via `services/mt5_auth.login_account()`
- File map: `backend/app/` directory tree with one-line descriptions for each subfolder
- Critical singletons / global state: MT5 (one connection per process), `TRAILING_STOPS` registry, Zustand stores

Use ASCII diagrams. Two diagrams: data flow + file map.

### 3. CONTRIBUTING.md

Short. Covers:
- Branch strategy (feature branches; PR to `main`)
- Commit convention (Conventional Commits — already in use)
- Test workflow: backend `pytest`, frontend `vitest`
- Lint: `npm run lint` (frontend), no Python linter configured (note as gap)
- How to add a new fund template (point at `backend/app/data/fund_templates.json`)
- How to add a new API endpoint (route in `app/routes/`, schema in `app/schemas.py`, register in `app/main.py`)

### 4. .env.example

Committed at `backend/.env.example`. Contains:
- `ENCRYPTION_KEY=` (with instructions to generate via `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
- `MT5_BASE_PATH=` (default path to MT5 terminal install)
- `MT5_TERMINALS_DIR=` (where per-account copies go)
- Comments explaining each

Update `.gitignore` to clarify `.env` (the actual secrets file) is gitignored but `.env.example` is committed.

### 5. Optional: Makefile (dev convenience)

Create `Makefile` at repo root with common targets:
- `make install` — install backend + frontend deps
- `make dev` — print instructions for the two-terminal dev workflow
- `make test` — run backend + frontend tests
- `make build` — production build (calls `build.bat` on Windows)
- `make clean` — remove `__pycache__`, `node_modules`, `dist`

Targets are simple shell pipelines. On Windows the user can run `make` if they have it (e.g., via Git Bash) — and the `build.bat` already covers Windows-native users.

## File Structure

| Path | Status | Purpose |
|------|--------|---------|
| `README.md` | MODIFY | Rewrite with updated structure + test commands + links |
| `ARCHITECTURE.md` | NEW | Top-level architecture doc |
| `CONTRIBUTING.md` | NEW | Dev workflow + conventions |
| `backend/.env.example` | NEW | Env var template |
| `.gitignore` | MODIFY | Confirm `.env` excluded, `.env.example` included |
| `docs/vi/README.md` | NEW | Vietnamese quickstart that links back to main README |
| `Makefile` | NEW | Optional, dev convenience targets |

## Success Criteria

- A new collaborator can run `git clone && make install && make test` (or follow README) and have a passing test suite in < 15 minutes
- `ARCHITECTURE.md` answers "where does X live?" for 5 random concerns (e.g., "WS reconnect logic", "fund rule check", "where are templates stored", "how is the MT5 password decrypted", "where does the equity snapshot get persisted") without reading code
- `.env.example` checked in; CI / fresh clones can copy it and set their own key
- README has a working "first 5 minutes" path
- Vietnamese summary points at the right places

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| README diverges from reality as the code evolves | Medium | Keep it short; defer detail to per-area docs (ARCHITECTURE, CONTRIBUTING). |
| Vietnamese summary becomes stale | Medium | Keep it tight — quickstart commands only, no concept explanations. |
| Makefile breaks for Windows users without make | Low | Document Windows-native alternative (build.bat) prominently. |
