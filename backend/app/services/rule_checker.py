from typing import Dict, Any, Optional
from sqlalchemy.orm import Session


class RuleChecker:
    def __init__(self, db: Session):
        self.db = db

    def check_account_rules(
        self,
        account_type: str,
        fund_program_id: Optional[int],
        current_phase: Optional[str],
        balance: float,
        equity: float,
        starting_balance: float,
        daily_starting_equity: float,
        margin_used_pct: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Check if account violates any fund rules for the current phase.

        Args:
            account_type: 'fund' or 'personal'
            fund_program_id: FundProgram ID if account_type is 'fund'
            current_phase: Current phase name (e.g. "Phase 1", "Funded")
            balance: Current balance
            equity: Current equity
            starting_balance: Initial balance when account was created
            daily_starting_equity: Equity at start of today (daily_open_equity)
            margin_used_pct: Current margin usage as percentage of balance

        Returns:
            Dict with 'locked', 'violations', 'messages', and progress metrics
        """
        if account_type != "fund" or fund_program_id is None:
            return {"locked": False, "violations": [], "messages": []}

        from app.models.funds import FundProgram, FundPhaseRule

        program = self.db.query(FundProgram).filter(FundProgram.id == fund_program_id).first()
        if not program:
            return {"locked": False, "violations": [], "messages": ["Program not found"]}

        # Find the phase rule for the current phase
        phase_rule = None
        if current_phase:
            phase_rule = (
                self.db.query(FundPhaseRule)
                .filter(
                    FundPhaseRule.program_id == program.id,
                    FundPhaseRule.phase_name == current_phase,
                )
                .first()
            )

        if not phase_rule:
            phase_rule = (
                self.db.query(FundPhaseRule)
                .filter(FundPhaseRule.program_id == program.id)
                .order_by(FundPhaseRule.phase_order)
                .first()
            )

        if not phase_rule:
            return {"locked": False, "violations": [], "messages": ["No phase rules found"]}

        violations = []
        messages = []

        # --- Daily drawdown ---
        daily_loss = daily_starting_equity - equity
        daily_loss_pct = (daily_loss / daily_starting_equity) * 100 if daily_starting_equity > 0 else 0

        if daily_loss_pct > phase_rule.daily_drawdown:
            violations.append("daily_drawdown")
            messages.append(
                f"Daily drawdown limit exceeded: {daily_loss_pct:.2f}% > {phase_rule.daily_drawdown}%"
            )

        # --- Max drawdown (static or EOD trailing) ---
        max_loss = starting_balance - equity
        max_loss_pct = (max_loss / starting_balance) * 100 if starting_balance > 0 else 0

        if max_loss_pct > phase_rule.max_drawdown:
            violations.append("max_drawdown")
            messages.append(
                f"Max drawdown limit exceeded: {max_loss_pct:.2f}% > {phase_rule.max_drawdown}% ({phase_rule.drawdown_type})"
            )

        # --- Best day rule ---
        best_day_pct = None
        if program.best_day_rule_pct is not None and daily_starting_equity > 0 and starting_balance > 0:
            today_profit = equity - daily_starting_equity
            today_profit_pct = (today_profit / starting_balance) * 100
            best_day_pct = round(today_profit_pct, 2)
            if today_profit_pct > program.best_day_rule_pct:
                violations.append("best_day_rule")
                messages.append(
                    f"Best day rule exceeded: today +{today_profit_pct:.2f}% > limit {program.best_day_rule_pct}%"
                )

        # --- Max margin ---
        if program.max_margin_pct is not None and margin_used_pct > program.max_margin_pct:
            violations.append("max_margin")
            messages.append(
                f"Margin usage exceeded: {margin_used_pct:.2f}% > {program.max_margin_pct}%"
            )

        locked = len(violations) > 0

        return {
            "locked": locked,
            "violations": violations,
            "messages": messages,
            "daily_loss_pct": round(daily_loss_pct, 2),
            "max_loss_pct": round(max_loss_pct, 2),
            "drawdown_type": phase_rule.drawdown_type,
            "phase": phase_rule.phase_name,
            "best_day_pct": best_day_pct,
            "best_day_limit": program.best_day_rule_pct,
        }

    def get_pre_trade_status(
        self,
        account,  # Account model instance
        proposed_risk_amount: float,
        proposed_reward_amount: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Advanced pre-trade validation for prop firm accounts.

        Encodes real prop-firm rule knowledge:
        - Daily DD: measured from daily_open_equity (equity at broker midnight reset),
          not from balance. Most firms (FTMO, FundedNext, FundedTrader) use this.
        - Max DD (static): floor = starting_balance, never moves.
        - Max DD (eod_trailing): floor = max(starting_balance, peak_eod_balance).
          Used by The5ers, Aqua Funded. Floor rises with your highest EOD balance.
        - Best day rule: today_pnl / starting_balance must stay under the limit.
          Prevents 'one big day' strategies (FTMO uses this).

        Warning thresholds:
        - 80% of daily/max DD used → warn
        - Trade risk > remaining daily room → "SL hit would breach" warning
        - Trade risk > 50% of remaining room → "uses X% of room" warning
        - Today profit > 80% of best day limit → near-limit warning

        Returns minimal dict for personal accounts (no fund rules to check).
        """
        # Personal accounts: no rules to check
        if account.account_type != "fund" or not account.fund_program_id:
            return {
                "level": "ok",
                "blocked": False,
                "block_reasons": [],
                "warnings": [],
                "daily_room_amount": None,
                "max_room_amount": None,
            }

        from app.models.funds import FundProgram, FundPhaseRule

        program = self.db.query(FundProgram).filter(FundProgram.id == account.fund_program_id).first()
        if not program:
            return {"level": "ok", "blocked": False, "block_reasons": [], "warnings": []}

        # Find phase rule
        phase_rule = None
        if account.current_phase:
            phase_rule = (
                self.db.query(FundPhaseRule)
                .filter(
                    FundPhaseRule.program_id == program.id,
                    FundPhaseRule.phase_name == account.current_phase,
                )
                .first()
            )
        if not phase_rule:
            phase_rule = (
                self.db.query(FundPhaseRule)
                .filter(FundPhaseRule.program_id == program.id)
                .order_by(FundPhaseRule.phase_order)
                .first()
            )
        if not phase_rule:
            return {"level": "ok", "blocked": False, "block_reasons": [], "warnings": []}

        equity = account.equity or account.balance or 0.0
        balance = account.balance or 0.0
        starting_balance = account.starting_balance or balance
        if starting_balance <= 0:
            starting_balance = balance

        # Daily starting equity: use tracked value, fall back to balance.
        # Critical: must be equity at broker-midnight, not intraday high.
        daily_starting = account.daily_open_equity if account.daily_open_equity else balance
        if daily_starting <= 0:
            daily_starting = balance

        # ── Daily Drawdown ────────────────────────────────────────────────────
        daily_dd_limit_pct: float = phase_rule.daily_drawdown or 0.0
        daily_dd_limit_amount = daily_starting * (daily_dd_limit_pct / 100.0)
        # Positive = losing money today; negative = currently profitable
        daily_loss_amount = max(0.0, daily_starting - equity)
        daily_loss_pct = (daily_loss_amount / daily_starting * 100.0) if daily_starting > 0 else 0.0
        # How much more loss the account can sustain today
        daily_room_amount = daily_dd_limit_amount - daily_loss_amount  # negative → already violated
        daily_room_pct = (daily_room_amount / daily_starting * 100.0) if daily_starting > 0 else 0.0

        # ── Max Drawdown ──────────────────────────────────────────────────────
        max_dd_limit_pct: float = phase_rule.max_drawdown or 0.0
        drawdown_type: str = phase_rule.drawdown_type or "static"

        if drawdown_type == "eod_trailing":
            # EOD trailing: the loss floor rises as your peak EOD balance grows.
            # Example (The5ers 100k, 10% DD): start $100k → floor $90k.
            # After making $5k (EOD balance $105k) → floor rises to $94.5k.
            peak_eod = getattr(account, "peak_eod_balance", None) or starting_balance
            effective_baseline = max(starting_balance, peak_eod)
        else:
            # Static: floor = starting_balance, never moves regardless of profits.
            effective_baseline = starting_balance

        max_dd_limit_amount = effective_baseline * (max_dd_limit_pct / 100.0)
        max_loss_amount = max(0.0, effective_baseline - equity)
        max_loss_pct = (max_loss_amount / effective_baseline * 100.0) if effective_baseline > 0 else 0.0
        max_room_amount = max_dd_limit_amount - max_loss_amount  # negative → already violated

        # ── Best Day Rule ─────────────────────────────────────────────────────
        # Best day = max daily profit as % of starting_balance.
        # Prevents "gamble everything to hit target in one day" strategies.
        best_day_limit_pct = program.best_day_rule_pct  # e.g., 5.0
        today_pnl = equity - daily_starting  # positive = profitable today
        best_day_limit_amount: Optional[float] = None
        best_day_room: Optional[float] = None

        if best_day_limit_pct is not None and starting_balance > 0:
            best_day_limit_amount = starting_balance * (best_day_limit_pct / 100.0)
            best_day_room = best_day_limit_amount - today_pnl  # negative → already violated

        # ── Trade Projection ──────────────────────────────────────────────────
        # If the SL is hit, the account absorbs `proposed_risk_amount` in loss.
        would_breach_daily_if_sl = proposed_risk_amount > daily_room_amount if daily_room_amount > 0 else True
        would_breach_max_if_sl = proposed_risk_amount > max_room_amount if max_room_amount > 0 else True
        daily_room_after_sl = daily_room_amount - proposed_risk_amount
        max_room_after_sl = max_room_amount - proposed_risk_amount

        # ── Classify ──────────────────────────────────────────────────────────
        block_reasons: list = []
        warnings: list = []

        # HARD BLOCK — account is already in violation, no new orders allowed
        if daily_room_amount <= 0:
            over = abs(daily_room_amount)
            block_reasons.append(
                f"Daily DD breached: {daily_loss_pct:.1f}% used of {daily_dd_limit_pct}% limit "
                f"(${over:.0f} over limit)"
            )
        if max_room_amount <= 0:
            block_reasons.append(
                f"Max DD breached: {max_loss_pct:.1f}% used of {max_dd_limit_pct}% limit"
                + (f" [{drawdown_type.replace('_', ' ')}]" if drawdown_type == "eod_trailing" else "")
            )
        if best_day_room is not None and best_day_limit_amount is not None and today_pnl >= best_day_limit_amount:
            block_reasons.append(
                f"Best day limit reached: +${today_pnl:.0f} today ≥ ${best_day_limit_amount:.0f} limit "
                f"({best_day_limit_pct}% of account). Stop trading for today."
            )

        # WARNINGS — not yet violated, but this trade is risky
        if not block_reasons:
            # Daily DD headroom
            if daily_room_amount > 0:
                daily_used_pct = (daily_loss_amount / daily_dd_limit_amount * 100) if daily_dd_limit_amount > 0 else 0
                if daily_used_pct >= 80:
                    warnings.append(
                        f"Daily DD at {daily_used_pct:.0f}% — only ${daily_room_amount:.0f} remaining today"
                    )
                if would_breach_daily_if_sl:
                    over = proposed_risk_amount - daily_room_amount
                    warnings.append(
                        f"⚠ If SL hits: daily DD breached by ${over:.0f} "
                        f"(risk ${proposed_risk_amount:.0f} > ${daily_room_amount:.0f} room)"
                    )
                elif proposed_risk_amount > daily_room_amount * 0.5:
                    pct_used = (proposed_risk_amount / daily_room_amount * 100)
                    warnings.append(
                        f"Risk ${proposed_risk_amount:.0f} uses {pct_used:.0f}% of "
                        f"${daily_room_amount:.0f} daily room remaining"
                    )

            # Max DD headroom
            if max_room_amount > 0:
                max_used_pct = (max_loss_amount / max_dd_limit_amount * 100) if max_dd_limit_amount > 0 else 0
                if max_used_pct >= 80:
                    warnings.append(
                        f"Max DD at {max_used_pct:.0f}% — only ${max_room_amount:.0f} remaining"
                        + (f" [{drawdown_type.replace('_', ' ')}]" if drawdown_type == "eod_trailing" else "")
                    )
                if would_breach_max_if_sl and max_used_pct >= 60:
                    warnings.append(
                        f"⚠ If SL hits: max DD would be breached (${max_room_after_sl:.0f})"
                    )

            # Best day warning
            if best_day_room is not None and best_day_limit_amount is not None and today_pnl > 0:
                if best_day_room < best_day_limit_amount * 0.2:
                    warnings.append(
                        f"Near best day limit — only ${best_day_room:.0f} profit headroom left today"
                    )

        level = "blocked" if block_reasons else ("warning" if warnings else "ok")

        return {
            "level": level,
            "blocked": len(block_reasons) > 0,
            "block_reasons": block_reasons,
            "warnings": warnings,
            # Daily DD
            "daily_loss_amount": round(daily_loss_amount, 2),
            "daily_loss_pct": round(daily_loss_pct, 2),
            "daily_dd_limit_pct": daily_dd_limit_pct,
            "daily_dd_limit_amount": round(daily_dd_limit_amount, 2),
            "daily_room_amount": round(daily_room_amount, 2),
            "daily_room_pct": round(max(0.0, daily_room_pct), 2),
            # Max DD
            "max_loss_amount": round(max_loss_amount, 2),
            "max_loss_pct": round(max_loss_pct, 2),
            "max_dd_limit_pct": max_dd_limit_pct,
            "max_dd_limit_amount": round(max_dd_limit_amount, 2),
            "max_room_amount": round(max_room_amount, 2),
            "effective_baseline": round(effective_baseline, 2),
            "drawdown_type": drawdown_type,
            # Best day
            "today_pnl": round(today_pnl, 2),
            "best_day_limit_pct": best_day_limit_pct,
            "best_day_limit_amount": round(best_day_limit_amount, 2) if best_day_limit_amount is not None else None,
            "best_day_room": round(best_day_room, 2) if best_day_room is not None else None,
            # Trade projection
            "risk_amount": round(proposed_risk_amount, 2),
            "would_breach_daily_if_sl": would_breach_daily_if_sl,
            "would_breach_max_if_sl": would_breach_max_if_sl,
            "daily_room_after_sl": round(daily_room_after_sl, 2),
            "max_room_after_sl": round(max_room_after_sl, 2),
            "phase": account.current_phase,
        }

    def check_profit_target(
        self,
        fund_program_id: int,
        current_phase: str,
        starting_balance: float,
        current_equity: float,
    ) -> Dict[str, Any]:
        """Check if profit target is achieved for the current phase"""
        from app.models.funds import FundProgram, FundPhaseRule

        phase_rule = (
            self.db.query(FundPhaseRule)
            .filter(
                FundPhaseRule.program_id == fund_program_id,
                FundPhaseRule.phase_name == current_phase,
            )
            .first()
        )

        if not phase_rule or phase_rule.profit_target is None:
            return {"achieved": False, "progress": 0, "target": None}

        profit = current_equity - starting_balance
        profit_pct = (profit / starting_balance) * 100 if starting_balance > 0 else 0

        achieved = profit_pct >= phase_rule.profit_target

        return {
            "achieved": achieved,
            "target": phase_rule.profit_target,
            "current": round(profit_pct, 2),
            "progress": round(
                (profit_pct / phase_rule.profit_target) * 100, 2
            ) if phase_rule.profit_target > 0 else 0,
        }

    def get_next_phase(self, fund_program_id: int, current_phase: str) -> Optional[str]:
        """Return the next phase name in sequence, or None if already at last phase."""
        from app.models.funds import FundPhaseRule

        rules = (
            self.db.query(FundPhaseRule)
            .filter(FundPhaseRule.program_id == fund_program_id)
            .order_by(FundPhaseRule.phase_order)
            .all()
        )

        for i, rule in enumerate(rules):
            if rule.phase_name == current_phase and i + 1 < len(rules):
                return rules[i + 1].phase_name

        return None
