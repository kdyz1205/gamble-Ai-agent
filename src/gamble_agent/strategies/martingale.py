"""Martingale (double-on-loss) betting strategy."""

from __future__ import annotations

from gamble_agent.domain.bankroll import BankrollManager
from gamble_agent.domain.models import BetOutcome, BetResult
from gamble_agent.strategies.base import BettingStrategy


class MartingaleStrategy(BettingStrategy):
    """Double the bet after each loss, reset to base after a win.

    Classic progression strategy. High short-term win rate but
    catastrophic risk of ruin during losing streaks.
    """

    def __init__(
        self,
        base_bet: float = 10.0,
        max_multiplier: int = 10,
        bet_type: str = "standard",
    ) -> None:
        if base_bet <= 0:
            raise ValueError("Base bet must be positive")
        if max_multiplier < 1:
            raise ValueError("Max multiplier must be at least 1")
        self._base_bet = base_bet
        self._max_multiplier = max_multiplier
        self._bet_type = bet_type
        self._current_multiplier = 1
        self._consecutive_losses = 0

    @property
    def name(self) -> str:
        return "martingale"

    def next_bet_amount(self, bankroll: BankrollManager) -> float:
        return self._base_bet * self._current_multiplier

    def next_bet_type(self) -> str:
        return self._bet_type

    def update(self, result: BetResult) -> None:
        if result.outcome == BetOutcome.LOSE:
            self._consecutive_losses += 1
            self._current_multiplier = min(
                2**self._consecutive_losses, self._max_multiplier
            )
        else:
            self._consecutive_losses = 0
            self._current_multiplier = 1

    def reset(self) -> None:
        self._consecutive_losses = 0
        self._current_multiplier = 1
