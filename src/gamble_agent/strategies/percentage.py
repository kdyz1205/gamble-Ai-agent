"""Percentage-of-bankroll betting strategy."""

from __future__ import annotations

from gamble_agent.domain.bankroll import BankrollManager
from gamble_agent.domain.models import BetResult
from gamble_agent.strategies.base import BettingStrategy


class PercentageBetStrategy(BettingStrategy):
    """Bet a fixed percentage of current bankroll each round.

    Naturally scales bets with bankroll size — bets decrease as bankroll
    shrinks, providing built-in risk management.
    """

    def __init__(
        self,
        percentage: float = 2.0,
        min_bet: float = 1.0,
        bet_type: str = "standard",
    ) -> None:
        if not 0 < percentage <= 100:
            raise ValueError("Percentage must be between 0 (exclusive) and 100 (inclusive)")
        if min_bet <= 0:
            raise ValueError("Min bet must be positive")
        self._percentage = percentage
        self._min_bet = min_bet
        self._bet_type = bet_type

    @property
    def name(self) -> str:
        return f"percentage_{self._percentage:g}"

    def next_bet_amount(self, bankroll: BankrollManager) -> float:
        bet = bankroll.balance * (self._percentage / 100)
        return max(bet, self._min_bet)

    def next_bet_type(self) -> str:
        return self._bet_type

    def update(self, result: BetResult) -> None:
        pass  # No state to update

    def reset(self) -> None:
        pass
