"""Abstract base class for betting strategies."""

from __future__ import annotations

from abc import ABC, abstractmethod

from gamble_agent.domain.bankroll import BankrollManager
from gamble_agent.domain.models import BetResult


class BettingStrategy(ABC):
    """Base class for all betting strategies.

    Strategies determine bet size and bet type based on game state and history.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for this strategy."""

    @abstractmethod
    def next_bet_amount(self, bankroll: BankrollManager) -> float:
        """Determine the next bet amount based on current state.

        Args:
            bankroll: The current bankroll manager.

        Returns:
            The recommended bet amount (before validation/clamping).
        """

    @abstractmethod
    def next_bet_type(self) -> str:
        """Determine the bet type for the next round."""

    @abstractmethod
    def update(self, result: BetResult) -> None:
        """Update strategy state after a round completes.

        Args:
            result: The result of the completed round.
        """

    def reset(self) -> None:
        """Reset strategy state to initial conditions."""
