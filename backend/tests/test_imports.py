"""Smoke test: every module imports without side-effects or circular imports."""


def test_routes_import():
    from app.routes import accounts, funds, mt5, trading, analytics, news
    from app.routes import system as system_routes
    assert accounts.router is not None
    assert funds.router is not None
    assert mt5.router is not None
    assert trading.router is not None
    assert analytics.router is not None
    assert system_routes.router is not None
    assert news.router is not None


def test_services_import():
    from app.services import (
        mt5_service,
        mt5_singleton,
        mt5_auth,
        mt5_streaming,
        fund_templates,
        position_sizer,
        rule_checker,
        encryption,
    )
    # All modules importable; spot-check key public names
    assert mt5_singleton.mt5_service is not None
    assert callable(mt5_auth.login_account)
    assert callable(fund_templates.load_templates)


def test_no_route_imports_from_another_route():
    """Guard against route→route coupling regressions."""
    import pathlib
    routes_dir = pathlib.Path(__file__).resolve().parent.parent / "app" / "routes"
    offenders = []
    for py in routes_dir.glob("*.py"):
        text = py.read_text(encoding="utf-8")
        if "from app.routes" in text or "import app.routes" in text:
            offenders.append(py.name)
    assert not offenders, f"Route files importing from other routes: {offenders}"
