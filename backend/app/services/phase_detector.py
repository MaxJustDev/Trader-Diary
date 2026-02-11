import re
import json
import logging
from typing import Optional, Dict, Union

logger = logging.getLogger(__name__)


def _format_to_regex(name_format: str) -> re.Pattern:
    """Convert a format string like '{id}: {phase} - {bal} {name}' into a regex with named groups.

    Each {placeholder} becomes a named capture group. Special regex chars in the
    literal parts are escaped.
    """
    parts = re.split(r"\{(\w+)\}", name_format)
    # parts alternates: literal, group_name, literal, group_name, ...
    regex = ""
    for i, part in enumerate(parts):
        if i % 2 == 0:
            # Literal text
            regex += re.escape(part)
        else:
            # Named group — use .+ (greedy) for all except last, .+ for last
            regex += f"(?P<{part}>.+?)"
    # Make the last capture group greedy so it grabs the remainder
    regex = regex[::-1].replace("+?.", "+.", 1)[::-1]
    return re.compile(regex, re.IGNORECASE)


def parse_starting_balance(mt5_name: str) -> Optional[float]:
    """Parse starting balance from MT5 account name.

    Matches patterns like: $6K, 6K, $7.5K, 10K, $100K, $200k, $1M, 50000, $50,000
    """
    if not mt5_name:
        return None

    # Try $XM or XM pattern (millions)
    m = re.search(r"\$?([\d.]+)\s*[Mm]", mt5_name)
    if m:
        return float(m.group(1)) * 1_000_000

    # Try $XK or XK pattern (thousands)
    m = re.search(r"\$?([\d.]+)\s*[Kk]", mt5_name)
    if m:
        return float(m.group(1)) * 1_000

    # Try $X,XXX or $XXXXX pattern (raw number with optional commas)
    m = re.search(r"\$(\d{1,3}(?:,\d{3})+|\d{4,})", mt5_name)
    if m:
        return float(m.group(1).replace(",", ""))

    return None


def detect_phase(mt5_account_name: str, fund) -> Optional[Dict[str, str]]:
    """Detect program and phase from an MT5 account name.

    Args:
        mt5_account_name: The name field from MT5 account_info
        fund: Fund SQLAlchemy model instance (with name_format and account_name_patterns)

    Returns:
        {"program_name": str, "phase_name": str} or None
    """
    if not mt5_account_name:
        return None

    patterns_json = fund.account_name_patterns
    if not patterns_json:
        return None

    try:
        patterns = json.loads(patterns_json)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Invalid account_name_patterns JSON for fund %s", fund.fund_name)
        return None

    # If fund has a name_format, extract the {phase} segment first
    phase_value = None
    if fund.name_format:
        try:
            fmt_regex = _format_to_regex(fund.name_format)
            match = fmt_regex.match(mt5_account_name)
            if match:
                phase_value = match.group("phase").strip()
                logger.info("Extracted phase value '%s' from '%s'", phase_value, mt5_account_name)
        except (re.error, IndexError) as e:
            logger.warning("Failed to parse name_format '%s': %s", fund.name_format, e)

    # Match against account_name_patterns
    # If we extracted a phase_value from the format, match against that;
    # otherwise fall back to matching against the full MT5 account name
    search_text = phase_value if phase_value else mt5_account_name

    for pattern in patterns:
        contains = pattern.get("contains", "")
        if contains and contains.lower() in search_text.lower():
            return {
                "program_name": pattern["program"],
                "phase_name": pattern["phase"],
            }

    # If format-based extraction found a value but no pattern matched,
    # try again with the full name as fallback
    if phase_value:
        for pattern in patterns:
            contains = pattern.get("contains", "")
            if contains and contains.lower() in mt5_account_name.lower():
                return {
                    "program_name": pattern["program"],
                    "phase_name": pattern["phase"],
                }

    return None
