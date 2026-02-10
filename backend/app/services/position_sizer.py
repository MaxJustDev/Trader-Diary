from typing import Dict, Any

class PositionSizer:
    def __init__(self, mt5_service):
        self.mt5_service = mt5_service
    
    def calculate(
        self, 
        balance: float, 
        risk_pct: float, 
        symbol: str,
        direction: str,
        tp_pips: float = 0,
        sl_pips: float = None
    ) -> Dict[str, Any]:
        """
        Calculate position size based on risk percentage
        
        Args:
            balance: Account balance
            risk_pct: Risk percentage (e.g., 1 for 1%)
            symbol: Trading symbol
            direction: BUY or SELL
            tp_pips: Take profit in pips
            sl_pips: Stop loss in pips (optional, can be auto-calculated)
        
        Returns:
            Dict with lot_size, sl_price, tp_price, risk_amount, rr_ratio
        """
        # Get symbol info
        symbol_info = self.mt5_service.get_symbol_info(symbol)
        if not symbol_info:
            return {"error": "Failed to get symbol info"}
        
        # Get current price
        tick = self.mt5_service.get_tick_price(symbol)
        if not tick:
            return {"error": "Failed to get tick price"}
        
        entry_price = tick['ask'] if direction.upper() == "BUY" else tick['bid']
        point = symbol_info['point']
        contract_size = symbol_info['trade_contract_size']
        
        # Calculate risk amount
        risk_amount = balance * (risk_pct / 100)
        
        # If SL pips not provided, auto-calculate based on risk
        # For MVP, we'll use a default or require it to be provided
        if sl_pips is None:
            sl_pips = 50  # Default 50 pips
        
        # Calculate pip value
        # For most pairs, pip_value = (point * contract_size) / entry_price for quote currency
        # Simplified: assume pip_value = 10 for standard lot on EURUSD-like pairs
        # More accurate calculation:
        pip_value = point * contract_size * 10  # Simplified for major pairs
        
        # Calculate lot size
        # lot_size = risk_amount / (sl_pips * pip_value)
        lot_size = risk_amount / (sl_pips * pip_value)
        
        # Round to volume step
        volume_step = symbol_info['volume_step']
        lot_size = round(lot_size / volume_step) * volume_step
        
        # Ensure within limits
        lot_size = max(symbol_info['volume_min'], min(lot_size, symbol_info['volume_max']))
        
        # Calculate SL and TP prices
        if direction.upper() == "BUY":
            sl_price = entry_price - (sl_pips * point * 10)
            tp_price = entry_price + (tp_pips * point * 10) if tp_pips > 0 else 0
        else:
            sl_price = entry_price + (sl_pips * point * 10)
            tp_price = entry_price - (tp_pips * point * 10) if tp_pips > 0 else 0
        
        # Calculate R:R ratio
        rr_ratio = (tp_pips / sl_pips) if sl_pips > 0 and tp_pips > 0 else 0
        
        return {
            "lot_size": round(lot_size, 2),
            "entry_price": round(entry_price, symbol_info['digits']),
            "sl_price": round(sl_price, symbol_info['digits']),
            "tp_price": round(tp_price, symbol_info['digits']) if tp_price > 0 else 0,
            "sl_pips": sl_pips,
            "tp_pips": tp_pips,
            "risk_amount": round(risk_amount, 2),
            "rr_ratio": round(rr_ratio, 2),
        }
    
    def validate_margin(self, symbol: str, volume: float, order_type: str, available_margin: float) -> bool:
        """Check if there's enough margin for the order"""
        required_margin = self.mt5_service.calculate_margin(symbol, volume, order_type)
        if required_margin is None:
            return False
        return available_margin >= required_margin
