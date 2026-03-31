"""Anti-Martingale (Paroli) betting strategy."""

from __future__ import annotations

from gamble_agent.domain.bankroll import BankrollManager
from gamble_agent.domain.models import BetOutcome, BetResult
from gamble_agent.strategies.base import BettingStrategy


class AntiMartingaleStrategy(BettingStrategy):
    """Double the bet after each win, reset to base after a loss.

    Aims to capitalize on winning streaks while limiting losses.
    Resets after a configurable number of consecutive wins.
    """

    def __init__(
        self,
        base_bet: float = 10.0,
        max_streak: int = 3,
        bet_type: str = "standard",
    ) -> None:
        if base_bet <= 0:
            raise ValueError("Base bet must be positive")
        if max_streak < 1:
            raise ValueError("Max streak must be at least 1")
        self._base_bet = base_bet
        self._max_streak = max_streak
        self._bet_type = bet_type
        self._consecutive_wins = 0

    @property
    def name(self) -> str:
        return "anti_martingale"

    def next_bet_amount(self, bankroll: BankrollManager) -> float:
        multiplier = 2**self._consecutive_wins
        return self._base_bet * multiplier

    def next_bet_type(self) -> str:
        return self._bet_type

    def update(self, result: BetResult) -> None:
        if result.outcome == BetOutcome.WIN:
            self._consecutive_wins += 1
            if self._consecutive_wins >= self._max_streak:
                self._consecutive_wins = 0
        else:
            self._consecutive_wins = 0

    def reset(self) -> None:
        self._consecutive_wins = 0
