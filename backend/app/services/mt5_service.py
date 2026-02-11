import MetaTrader5 as mt5
from typing import Optional, Dict, Any, List
from datetime import datetime
import os
import time
import logging

logger = logging.getLogger(__name__)

# Default path used as the base template for copying
MT5_BASE_PATH = os.environ.get(
    "MT5_BASE_PATH",
    r"C:\Program Files\MetaTrader 5",
)

# Directory where per-account terminal copies are stored
MT5_TERMINALS_DIR = os.environ.get(
    "MT5_TERMINALS_DIR",
    r"C:\Program Files",
)


class MT5Service:
    def __init__(self):
        self.connected_account = None
        self.is_initialized = False
        self.current_path = None

    @staticmethod
    def default_exe_path() -> str:
        """Return the default terminal64.exe path."""
        return os.path.join(MT5_BASE_PATH, "terminal64.exe")

    def initialize(self, path: Optional[str] = None) -> bool:
        """Initialize MT5 connection with retry.

        Args:
            path: Path to terminal64.exe. If None, uses default base path.
        """
        terminal_exe = path or os.path.join(MT5_BASE_PATH, "terminal64.exe")

        # If already initialized with a different path, shutdown first
        if self.is_initialized and self.current_path != terminal_exe:
            self.shutdown()

        if self.is_initialized:
            if mt5.terminal_info() is not None:
                return True
            self.is_initialized = False

        for attempt in range(3):
            try:
                mt5.shutdown()
            except Exception:
                pass

            time.sleep(0.2 * attempt)

            if mt5.initialize(path=terminal_exe):
                self.is_initialized = True
                self.current_path = terminal_exe
                return True

            error = mt5.last_error()
            logger.warning("MT5 init attempt %d failed: %s", attempt + 1, error)

        logger.error("MT5 initialization failed after 3 attempts")
        return False

    def shutdown(self):
        """Shutdown MT5 connection completely"""
        try:
            mt5.shutdown()
        except Exception:
            pass
        self.is_initialized = False
        self.connected_account = None
        self.current_path = None

    def login(self, account: int, password: str, server: str, path: Optional[str] = None) -> bool:
        """Login to MT5 account"""
        if not self.is_initialized or (path and self.current_path != path):
            if not self.initialize(path=path):
                return False

        if mt5.login(account, password=password, server=server):
            self.connected_account = account
            return True
        else:
            logger.warning("Login failed for %d: %s", account, mt5.last_error())
            return False

    def logout(self):
        """Logout from current account (keeps MT5 initialized for next login)"""
        self.connected_account = None
        # Don't shutdown MT5 - just clear the account reference.
        # This allows the next login() to reuse the initialized terminal.

    def get_account_info(self) -> Optional[Dict[str, Any]]:
        """Get current account information"""
        if not self.is_initialized:
            return None

        account_info = mt5.account_info()
        if account_info is None:
            return None

        return {
            "login": account_info.login,
            "name": account_info.name,
            "balance": account_info.balance,
            "equity": account_info.equity,
            "margin": account_info.margin,
            "margin_free": account_info.margin_free,
            "margin_level": account_info.margin_level,
            "profit": account_info.profit,
            "currency": account_info.currency,
        }

    def get_positions(self) -> List[Dict[str, Any]]:
        """Get all open positions"""
        if not self.is_initialized:
            return []

        positions = mt5.positions_get()
        if positions is None:
            return []

        return [
            {
                "ticket": pos.ticket,
                "symbol": pos.symbol,
                "type": "BUY" if pos.type == mt5.ORDER_TYPE_BUY else "SELL",
                "volume": pos.volume,
                "price_open": pos.price_open,
                "sl": pos.sl,
                "tp": pos.tp,
                "profit": pos.profit,
                "time": datetime.fromtimestamp(pos.time).isoformat(),
            }
            for pos in positions
        ]

    def get_symbol_info(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get symbol information"""
        if not self.is_initialized:
            return None

        symbol_info = mt5.symbol_info(symbol)
        if symbol_info is None:
            return None

        return {
            "symbol": symbol_info.name,
            "point": symbol_info.point,
            "digits": symbol_info.digits,
            "trade_contract_size": symbol_info.trade_contract_size,
            "volume_min": symbol_info.volume_min,
            "volume_max": symbol_info.volume_max,
            "volume_step": symbol_info.volume_step,
        }

    def get_tick_price(self, symbol: str) -> Optional[Dict[str, float]]:
        """Get current tick price"""
        if not self.is_initialized:
            return None

        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return None

        return {
            "bid": tick.bid,
            "ask": tick.ask,
            "last": tick.last,
        }

    def calculate_margin(self, symbol: str, volume: float, order_type: str) -> Optional[float]:
        """Calculate required margin for an order"""
        if not self.is_initialized:
            return None

        action = mt5.ORDER_TYPE_BUY if order_type.upper() == "BUY" else mt5.ORDER_TYPE_SELL
        margin = mt5.order_calc_margin(action, symbol, volume, 0.0)

        return margin

    def place_market_order(
        self,
        symbol: str,
        volume: float,
        order_type: str,
        sl: float = 0.0,
        tp: float = 0.0,
        comment: str = "",
    ) -> Dict[str, Any]:
        """Place a market order"""
        if not self.is_initialized:
            return {"success": False, "error": "MT5 not initialized"}

        # Get current price
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return {"success": False, "error": f"Failed to get tick for {symbol}"}

        price = tick.ask if order_type.upper() == "BUY" else tick.bid
        action = mt5.TRADE_ACTION_DEAL
        type_order = mt5.ORDER_TYPE_BUY if order_type.upper() == "BUY" else mt5.ORDER_TYPE_SELL

        request = {
            "action": action,
            "symbol": symbol,
            "volume": volume,
            "type": type_order,
            "price": price,
            "sl": sl,
            "tp": tp,
            "deviation": 20,
            "magic": 234000,
            "comment": comment,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }

        result = mt5.order_send(request)

        if result is None:
            return {"success": False, "error": "Order send failed"}

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return {
                "success": False,
                "error": f"Order failed with retcode {result.retcode}: {result.comment}",
            }

        return {
            "success": True,
            "order": result.order,
            "volume": result.volume,
            "price": result.price,
            "comment": result.comment,
        }
