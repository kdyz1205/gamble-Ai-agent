"""Centralized game engine registry."""

from __future__ import annotations

from gamble_agent.domain.models import GameType
from gamble_agent.games.base import GameEngine
from gamble_agent.games.blackjack import BlackjackEngine
from gamble_agent.games.dice import DiceEngine
from gamble_agent.games.roulette import RouletteEngine
from gamble_agent.games.slots import SlotsEngine

_GAME_ENGINES: dict[GameType, type[GameEngine]] = {
    GameType.BLACKJACK: BlackjackEngine,
    GameType.ROULETTE: RouletteEngine,
    GameType.DICE: DiceEngine,
    GameType.SLOTS: SlotsEngine,
}

# Default bet types per game (used when strategies specify "standard")
GAME_DEFAULT_BET_TYPES: dict[GameType, str] = {
    GameType.BLACKJACK: "standard",
    GameType.ROULETTE: "red",
    GameType.DICE: "pass",
    GameType.SLOTS: "spin",
}


def get_engine_class(game_type: GameType) -> type[GameEngine]:
    """Get the engine class for a game type."""
    if game_type not in _GAME_ENGINES:
        raise ValueError(f"Unknown game type: {game_type}")
    return _GAME_ENGINES[game_type]


def get_all_engines() -> dict[GameType, type[GameEngine]]:
    """Get all registered game engines."""
    return dict(_GAME_ENGINES)


def get_default_bet_type(game_type: GameType) -> str:
    """Get the default bet type for a game."""
    return GAME_DEFAULT_BET_TYPES.get(game_type, "standard")
