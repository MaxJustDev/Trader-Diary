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
            daily_starting_equity: Equity at start of day
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
            # Fall back to first phase rule
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

        # Check daily drawdown
        daily_loss = daily_starting_equity - equity
        daily_loss_pct = (daily_loss / daily_starting_equity) * 100 if daily_starting_equity > 0 else 0

        if daily_loss_pct > phase_rule.daily_drawdown:
            violations.append("daily_drawdown")
            messages.append(
                f"Daily drawdown limit exceeded: {daily_loss_pct:.2f}% > {phase_rule.daily_drawdown}%"
            )

        # Check max drawdown based on drawdown_type
        if phase_rule.drawdown_type == "eod_trailing":
            # EOD trailing: drawdown measured from highest EOD equity
            # For now we use starting_balance as proxy (caller should pass highest EOD)
            max_loss = starting_balance - equity
            max_loss_pct = (max_loss / starting_balance) * 100 if starting_balance > 0 else 0
        else:
            # Static: drawdown measured from initial balance
            max_loss = starting_balance - equity
            max_loss_pct = (max_loss / starting_balance) * 100 if starting_balance > 0 else 0

        if max_loss_pct > phase_rule.max_drawdown:
            violations.append("max_drawdown")
            messages.append(
                f"Max drawdown limit exceeded: {max_loss_pct:.2f}% > {phase_rule.max_drawdown}% ({phase_rule.drawdown_type})"
            )

        # Check best day rule
        if program.best_day_rule_pct is not None:
            # This would need daily P&L data - flag for awareness
            pass

        # Check max margin
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
