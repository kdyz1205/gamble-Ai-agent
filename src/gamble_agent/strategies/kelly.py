"""Kelly Criterion betting strategy."""

from __future__ import annotations

from gamble_agent.domain.bankroll import BankrollManager
from gamble_agent.domain.models import BetOutcome, BetResult
from gamble_agent.strategies.base import BettingStrategy


class KellyCriterionStrategy(BettingStrategy):
    """Bet a fraction of bankroll based on the Kelly Criterion.

    f* = (bp - q) / b
    where:
        b = odds received (net payout per unit wagered)
        p = probability of winning
        q = probability of losing (1 - p)

    Uses a fractional Kelly (fraction parameter) to reduce variance.
    Win probability is estimated from observed results.
    """

    def __init__(
        self,
        win_prob: float = 0.49,
        payout_odds: float = 1.0,
        fraction: float = 0.25,
        min_bet: float = 5.0,
        bet_type: str = "standard",
    ) -> None:
        if not 0 < win_prob < 1:
            raise ValueError("Win probability must be between 0 and 1")
        if payout_odds <= 0:
            raise ValueError("Payout odds must be positive")
        if not 0 < fraction <= 1:
            raise ValueError("Kelly fraction must be between 0 and 1")

        self._win_prob = win_prob
        self._payout_odds = payout_odds
        self._fraction = fraction
        self._min_bet = min_bet
        self._bet_type = bet_type

        # Adaptive tracking
        self._wins = 0
        self._total = 0

    @property
    def name(self) -> str:
        return f"kelly_{self._fraction}"

    @property
    def estimated_win_prob(self) -> float:
        if self._total < 30:
            return self._win_prob  # Use prior until we have enough data
        return self._wins / self._total

    def next_bet_amount(self, bankroll: BankrollManager) -> float:
        p = self.estimated_win_prob
        q = 1 - p
        b = self._payout_odds

        kelly_fraction = (b * p - q) / b
        if kelly_fraction <= 0:
            return self._min_bet  # Edge is negative, bet minimum

        bet = bankroll.balance * kelly_fraction * self._fraction
        return max(bet, self._min_bet)

    def next_bet_type(self) -> str:
        return self._bet_type

    def update(self, result: BetResult) -> None:
        self._total += 1
        if result.outcome == BetOutcome.WIN:
            self._wins += 1

    def reset(self) -> None:
        self._wins = 0
        self._total = 0
