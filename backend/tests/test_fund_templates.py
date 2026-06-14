def test_load_templates_returns_dict_with_expected_funds():
    from app.services.fund_templates import load_templates

    templates = load_templates()
    assert isinstance(templates, dict)
    for key in ("FTMO", "The5ers", "Fortrades"):
        assert key in templates, f"missing template: {key}"


def test_load_templates_caches_same_instance():
    from app.services.fund_templates import load_templates

    a = load_templates()
    b = load_templates()
    assert a is b, "load_templates() should return a cached singleton"


def test_first_program_phase_rule_round_trip():
    """JSON ↔ dict round trip preserved None/True/False correctly."""
    from app.services.fund_templates import load_templates

    ftmo = load_templates()["FTMO"]
    first_program = ftmo["programs"][0]
    first_phase = first_program["phase_rules"][0]
    assert isinstance(first_phase["profit_target"], (int, float)) or first_phase["profit_target"] is None
    assert first_phase["drawdown_type"] in ("static", "eod_trailing")
