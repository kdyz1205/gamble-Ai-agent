"""Abstract base class for game engines."""

from __future__ import annotations

from abc import ABC, abstractmethod

from gamble_agent.domain.models import Bet, BetResult, GameType


class GameEngine(ABC):
    """Base class for all game engines.

    Each engine encapsulates the rules and payout logic for a specific game.
    Engines are stateless per-round: they receive a bet and return a result.
    """

    @property
    @abstractmethod
    def game_type(self) -> GameType:
        """The type of game this engine implements."""

    @property
    @abstractmethod
    def valid_bet_types(self) -> list[str]:
        """List of valid bet type strings for this game."""

    @property
    @abstractmethod
    def house_edge(self) -> float:
        """Theoretical house edge as a percentage."""

    @abstractmethod
    def play_round(self, bet: Bet) -> tuple[BetResult, dict[str, object]]:
        """Play a single round with the given bet.

        Returns:
            A tuple of (BetResult, details_dict) where details_dict contains
            game-specific information about the round.

        Raises:
            ValueError: If the bet type is not valid for this game.
        """

    def validate_bet_type(self, bet_type: str) -> None:
        """Validate that a bet type is supported by this game."""
        if bet_type not in self.valid_bet_types:
            raise ValueError(
                f"Invalid bet type '{bet_type}' for {self.game_type.value}. "
                f"Valid types: {self.valid_bet_types}"
            )
