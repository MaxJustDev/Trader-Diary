# Contributing

Thanks for the interest. The project is small enough that you can read all of the backend in an afternoon. Start with [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Workflow

1. Fork or branch off `main`. Use a short descriptive name (`fix-margin-rounding`, `feat-news-filter`).
2. Make focused commits. We use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `docs:`, `chore:`.
3. Run the test suites before opening a PR.
4. Open a PR against `main`. Describe what changed and why. Reference an issue if there is one.

We don't squash or force-push on shared branches. Rebase locally is fine before opening a PR.

## Setup

See [README.md](./README.md). The minimum is:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements-dev.txt    # includes pytest
copy .env.example .env

cd ..\frontend
npm install
```

## Tests

```powershell
# Backend
cd backend && .\venv\Scripts\activate && pytest -v

# Frontend
cd frontend && npm test
```

The backend test suite currently covers:
- `tests/test_async_helpers.py` — MT5 / DB executor invariants
- `tests/test_fund_templates.py` — JSON loader
- `tests/test_mt5_auth.py` — login flow
- `tests/test_mt5_singleton.py` — module-level state
- `tests/test_imports.py` — no circular / route→route imports

Frontend tests use Vitest (`__tests__/...`). Component tests use `@testing-library/react`.

There is no formal MT5 integration test — that requires a live terminal + broker account. Manual smoke is described in each batch's spec under `docs/superpowers/specs/`.

## Lint

```powershell
cd frontend && npm run lint
```

No Python linter is configured yet. Treat `pyflakes`-level warnings (unused imports, undefined names) as bugs and fix them.

## How to add a new fund template

1. Open `backend/app/data/fund_templates.json`.
2. Add a new top-level key for the fund (e.g. `"MyPropFirm"`). Use an existing entry as a model — copy the structure exactly.
3. The fields you'll need:
   - `fund_name` — display name
   - `server_pattern` — substring/regex used to auto-detect the fund from an MT5 server name
   - `name_format` — null if you use `account_name_patterns` matching, else a printf-style template
   - `account_name_patterns` — list of `{contains, program, phase}` rules for parsing MT5 account names
   - `programs` — list of programs, each with `payout_*`, `phase_rules` (Phase 1, Phase 2, Funded, etc.)
4. Each phase rule needs `profit_target` (or null for funded), `daily_drawdown`, `max_drawdown`, `drawdown_type` (`"static"` or `"eod_trailing"`).
5. Restart the backend. `lru_cache` re-loads the JSON on the next process boot.
6. In the app: Funds page → Refresh Templates → your new template should appear; create an instance to populate the DB.

## How to add a new API endpoint

1. **Schema**: Add request/response Pydantic models to `backend/app/schemas.py`.
2. **Route**: Add the handler to the appropriate file under `backend/app/routes/`. Keep it thin — delegate business logic to a service module.
3. **Service**: If new logic, add a function under `backend/app/services/`. Sync by default; async only if you genuinely need it.
4. **Register**: If you created a NEW route file, register the router in `backend/app/main.py` with `app.include_router(...)`.
5. **MT5 calls**: any sync MT5 call inside an `async def` handler MUST go through `await run_mt5(...)`. See `backend/app/utils/async_helpers.py`.
6. **DB session**: use the `db: Session = Depends(get_db)` dependency. Don't manually `SessionLocal()` inside handlers unless you're in a background task.
7. **Frontend client**: add a method to `frontend/lib/api-client.ts`.
8. **Tests**: add one that asserts the handler imports + the route registers.

## Adding constants / tunables

Put them in `backend/app/config.py`. Don't sprinkle magic numbers in route files.

## Async / threading gotchas

- The `MetaTrader5` Python library is a global per-process singleton with stateful connection. Only call it from the dedicated executor (`run_mt5`). Calling from multiple threads = undefined behavior.
- SQLite with `check_same_thread=False` is safe across threads (`run_db` pool is fine).
- Don't add new background tasks without thinking about shutdown — they should listen for a cancellation event.

## Design docs

Major changes get a spec + plan under `docs/superpowers/`. Look at the recent ones for the format:

- `docs/superpowers/specs/2026-05-25-batch-a-backend-performance-design.md`
- `docs/superpowers/plans/2026-05-25-batch-a-backend-performance.md`

For small fixes (one-liner, typo, bug fix), no spec needed.

## Reporting bugs

Open a GitHub issue with:
- What you were doing
- What happened
- What you expected
- Backend log snippet (from the terminal where you ran `python run.py`)
- Browser console output if frontend-related

Don't paste secrets (encryption key, MT5 password).
