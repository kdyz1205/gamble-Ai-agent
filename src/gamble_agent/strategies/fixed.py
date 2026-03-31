"""Fixed-size betting strategy."""

from __future__ import annotations

from gamble_agent.domain.bankroll import BankrollManager
from gamble_agent.domain.models import BetResult
from gamble_agent.strategies.base import BettingStrategy


class FixedBetStrategy(BettingStrategy):
    """Always bet a fixed amount. Simplest possible strategy."""

    def __init__(self, bet_amount: float = 10.0, bet_type: str = "standard") -> None:
        if bet_amount <= 0:
            raise ValueError("Bet amount must be positive")
        self._bet_amount = bet_amount
        self._bet_type = bet_type

    @property
    def name(self) -> str:
        return f"fixed_{self._bet_amount:g}"

    def next_bet_amount(self, bankroll: BankrollManager) -> float:
        return self._bet_amount

    def next_bet_type(self) -> str:
        return self._bet_type

    def update(self, result: BetResult) -> None:
        pass  # No state to update

    def reset(self) -> None:
        pass
