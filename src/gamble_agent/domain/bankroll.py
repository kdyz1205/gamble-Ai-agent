"""Bankroll management with tracking and risk controls."""

from __future__ import annotations

import structlog

logger = structlog.get_logger()


class InsufficientFundsError(Exception):
    """Raised when a bet exceeds available bankroll."""


class BankrollManager:
    """Manages bankroll state with safety limits and history tracking."""

    def __init__(
        self,
        initial_bankroll: float,
        min_bet: float = 1.0,
        max_bet: float = 10000.0,
        stop_loss_pct: float = 0.0,
        take_profit_pct: float = 0.0,
    ) -> None:
        if initial_bankroll <= 0:
            raise ValueError("Initial bankroll must be positive")
        if min_bet <= 0 or max_bet <= 0:
            raise ValueError("Bet limits must be positive")
        if min_bet > max_bet:
            raise ValueError("min_bet cannot exceed max_bet")

        self._initial = initial_bankroll
        self._balance = initial_bankroll
        self._min_bet = min_bet
        self._max_bet = max_bet
        self._peak = initial_bankroll
        self._trough = initial_bankroll
        self._history: list[float] = [initial_bankroll]

        # Stop-loss / take-profit thresholds (0 = disabled)
        self._stop_loss = initial_bankroll * (stop_loss_pct / 100) if stop_loss_pct > 0 else 0.0
        self._take_profit = (
            initial_bankroll * (1 + take_profit_pct / 100) if take_profit_pct > 0 else 0.0
        )

    @property
    def balance(self) -> float:
        return self._balance

    @property
    def initial_bankroll(self) -> float:
        return self._initial

    @property
    def peak(self) -> float:
        return self._peak

    @property
    def trough(self) -> float:
        return self._trough

    @property
    def history(self) -> list[float]:
        return list(self._history)

    @property
    def net_profit(self) -> float:
        return self._balance - self._initial

    @property
    def is_bust(self) -> bool:
        return self._balance < self._min_bet

    @property
    def should_stop(self) -> bool:
        if self.is_bust:
            return True
        if self._stop_loss > 0 and self._balance <= self._stop_loss:
            return True
        if self._take_profit > 0 and self._balance >= self._take_profit:
            return True
        return False

    def validate_bet(self, amount: float) -> float:
        """Validate and clamp a bet amount to allowed range. Returns the valid amount."""
        if amount <= 0:
            raise ValueError("Bet amount must be positive")
        amount = max(self._min_bet, min(amount, self._max_bet))
        if amount > self._balance:
            raise InsufficientFundsError(
                f"Bet {amount:.2f} exceeds balance {self._balance:.2f}"
            )
        return amount

    def debit(self, amount: float) -> None:
        """Deduct a bet amount from the bankroll."""
        if amount > self._balance:
            raise InsufficientFundsError(
                f"Cannot debit {amount:.2f} from balance {self._balance:.2f}"
            )
        self._balance -= amount

    def credit(self, amount: float) -> None:
        """Add winnings to the bankroll."""
        if amount < 0:
            raise ValueError("Credit amount cannot be negative")
        self._balance += amount

    def record_snapshot(self) -> None:
        """Record the current balance in history and update peak/trough."""
        self._history.append(self._balance)
        if self._balance > self._peak:
            self._peak = self._balance
        if self._balance < self._trough:
            self._trough = self._balance

    def max_drawdown(self) -> float:
        """Calculate maximum drawdown percentage from peak."""
        if self._peak == 0:
            return 0.0
        return ((self._peak - self._trough) / self._peak) * 100
