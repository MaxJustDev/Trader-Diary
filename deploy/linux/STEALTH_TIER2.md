# Stealth Tier 2 — GUI automation (design, not implemented)

## Why
Tier 1 sets `magic=0` and a natural comment, defeating the common prop-firm EA
checks. It cannot change the server-stamped deal `reason`: orders sent via the
MetaTrader5 Python API are stamped `DEAL_REASON_EXPERT`. Firms that inspect the
deal `reason` will still see "expert". The only way to register a trade as a
manual `DEAL_REASON_CLIENT` is to drive the terminal UI itself.

## Approach
The MT5 terminal already runs under Wine on a virtual display (`Xvfb :99`).
Automate the One-Click-Trading panel via GUI input against that display:

1. Ensure the symbol is in Market Watch and the chart/One-Click panel is open.
2. Set volume, then click Buy/Sell on the One-Click panel.
3. For SL/TP, open the order dialog (F9), fill fields, submit.

Tooling options (Linux side, acting on the Wine X server):
- `xdotool` — move/click/type against `DISPLAY=:99` (search window, send keys).
- OpenCV template-matching on `import`/`xwd` screenshots to locate buttons
  robustly across terminal themes.

## Why it's deferred
- Fragile: coordinates shift with terminal version/theme/DPI; needs template
  matching + retries.
- Slow: seconds per order vs milliseconds for the API path — bad on an Atom.
- Hard to verify headless; needs a feedback loop reading the resulting deal.

## Integration sketch (when built)
- `backend/app/services/stealth_gui.py` exposes
  `place_via_gui(symbol, volume, side, sl, tp) -> dict` with the same return
  shape as the API path.
- `stealth.apply_stealth(..., mode="tier2")` would route order placement through
  the GUI path instead of `mt5.order_send` when `STEALTH_MODE=tier2`.
- A new bridge method `gui_place_order` would run the xdotool sequence on the
  Wine side (where the X server and terminal live).

## Acceptance criteria for a future Tier-2 task
- A placed order's deal shows `reason == DEAL_REASON_CLIENT` (verify via
  `history_deals_get`).
- Round-trip latency and failure-retry behavior documented and bounded.
