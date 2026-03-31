"""D'Alembert betting strategy."""

from __future__ import annotations

from gamble_agent.domain.bankroll import BankrollManager
from gamble_agent.domain.models import BetOutcome, BetResult
from gamble_agent.strategies.base import BettingStrategy


class DAlembertStrategy(BettingStrategy):
    """Increase bet by one unit after a loss, decrease by one unit after a win.

    A more conservative progression than Martingale. Based on the gambler's
    fallacy that wins and losses will eventually balance out.
    """

    def __init__(
        self,
        base_bet: float = 10.0,
        unit: float = 5.0,
        bet_type: str = "standard",
    ) -> None:
        if base_bet <= 0:
            raise ValueError("Base bet must be positive")
        if unit <= 0:
            raise ValueError("Unit must be positive")
        self._base_bet = base_bet
        self._unit = unit
        self._bet_type = bet_type
        self._current_bet = base_bet

    @property
    def name(self) -> str:
        return "dalembert"

    def next_bet_amount(self, bankroll: BankrollManager) -> float:
        return self._current_bet

    def next_bet_type(self) -> str:
        return self._bet_type

    def update(self, result: BetResult) -> None:
        if result.outcome == BetOutcome.LOSE:
            self._current_bet += self._unit
        elif result.outcome == BetOutcome.WIN:
            self._current_bet = max(self._base_bet, self._current_bet - self._unit)

    def reset(self) -> None:
        self._current_bet = self._base_bet
