import math
from typing import Dict, Any, Optional


class PositionSizer:
    def __init__(self, mt5_service):
        self.mt5_service = mt5_service

    def calculate(
        self,
        balance: float,
        symbol: str,
        direction: str,
        sl_price: float,
        risk_type: str = "pct",
        risk_value: float = 1.0,
        tp_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        EA-style Position Sizer: calculates lot_size as the output.

        Inputs:
            balance: account balance
            symbol: trading symbol
            direction: "BUY" or "SELL"
            sl_price: absolute stop loss price
            risk_type: "pct" (% of balance) or "fixed" ($ amount)
            risk_value: the risk % or fixed $ amount
            tp_price: absolute take profit price (optional)

        Output: lot_size, entry_price, sl/tp prices & pips, risk/reward amounts, R:R
        """
        symbol_info = self.mt5_service.get_symbol_info(symbol)
        if not symbol_info:
            return {"error": "Failed to get symbol info"}

        tick = self.mt5_service.get_tick_price(symbol)
        if not tick:
            return {"error": "Failed to get tick price"}

        entry_price = tick["ask"] if direction.upper() == "BUY" else tick["bid"]
        point = symbol_info["point"]
        contract_size = symbol_info["trade_contract_size"]
        digits = symbol_info["digits"]
        volume_min = symbol_info["volume_min"]
        volume_max = symbol_info["volume_max"]
        volume_step = symbol_info["volume_step"]

        # pip = 10 points (e.g. 0.0001 for 5-digit, 0.01 for 3-digit)
        pip_size = point * 10
        pip_value_per_lot = pip_size * contract_size  # value of 1 pip for 1 lot

        # SL distance in pips
        if direction.upper() == "BUY":
            sl_pips = (entry_price - sl_price) / pip_size
        else:
            sl_pips = (sl_price - entry_price) / pip_size

        if sl_pips <= 0:
            return {"error": "SL price is on the wrong side of entry"}

        # Risk amount
        if risk_type == "pct":
            risk_amount = balance * (risk_value / 100)
            risk_pct = risk_value
        else:
            risk_amount = risk_value
            risk_pct = (risk_amount / balance * 100) if balance > 0 else 0

        # Calculate lot size: risk_amount / (sl_pips × pip_value_per_lot)
        lot_size = risk_amount / (sl_pips * pip_value_per_lot)

        # Round to volume_step, clamp to min/max
        if volume_step > 0:
            lot_size = math.floor(lot_size / volume_step) * volume_step
        lot_size = max(volume_min, min(volume_max, lot_size))
        lot_size = round(lot_size, 2)

        # Recalculate actual risk after rounding
        actual_risk_amount = lot_size * sl_pips * pip_value_per_lot
        actual_risk_pct = (actual_risk_amount / balance * 100) if balance > 0 else 0

        # TP calculations
        tp_pips = 0.0
        reward_amount = 0.0
        if tp_price and tp_price > 0:
            if direction.upper() == "BUY":
                tp_pips = (tp_price - entry_price) / pip_size
            else:
                tp_pips = (entry_price - tp_price) / pip_size
            reward_amount = lot_size * tp_pips * pip_value_per_lot
        else:
            tp_price = 0

        rr_ratio = (tp_pips / sl_pips) if sl_pips > 0 and tp_pips > 0 else 0

        return {
            "lot_size": lot_size,
            "entry_price": round(entry_price, digits),
            "sl_price": round(sl_price, digits),
            "tp_price": round(tp_price, digits) if tp_price > 0 else 0,
            "sl_pips": round(sl_pips, 1),
            "tp_pips": round(tp_pips, 1),
            "risk_pct": round(actual_risk_pct, 2),
            "risk_amount": round(actual_risk_amount, 2),
            "reward_amount": round(reward_amount, 2),
            "rr_ratio": round(rr_ratio, 2),
        }

    def validate_margin(
        self, symbol: str, volume: float, order_type: str, available_margin: float
    ) -> bool:
        """Check if there's enough margin for the order"""
        required_margin = self.mt5_service.calculate_margin(symbol, volume, order_type)
        if required_margin is None:
            return False
        return available_margin >= required_margin
