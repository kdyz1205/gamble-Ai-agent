"""Slots game engine with configurable symbol weights and payouts."""

from __future__ import annotations

import random

from gamble_agent.domain.models import Bet, BetOutcome, BetResult, GameType
from gamble_agent.games.base import GameEngine

# Symbol definitions with weights and payouts for 3-reel match
SYMBOLS = {
    "cherry": {"weight": 30, "payout_2": 2, "payout_3": 5},
    "lemon": {"weight": 25, "payout_2": 0, "payout_3": 8},
    "orange": {"weight": 20, "payout_2": 0, "payout_3": 10},
    "plum": {"weight": 15, "payout_2": 0, "payout_3": 15},
    "bell": {"weight": 7, "payout_2": 0, "payout_3": 25},
    "bar": {"weight": 2, "payout_2": 0, "payout_3": 50},
    "seven": {"weight": 1, "payout_2": 0, "payout_3": 100},
}

SYMBOL_NAMES = list(SYMBOLS.keys())
SYMBOL_WEIGHTS = [SYMBOLS[s]["weight"] for s in SYMBOL_NAMES]


class SlotsEngine(GameEngine):
    """Three-reel slot machine with weighted symbols."""

    def __init__(self, rng: random.Random | None = None) -> None:
        self._rng = rng or random.Random()

    @property
    def game_type(self) -> GameType:
        return GameType.SLOTS

    @property
    def valid_bet_types(self) -> list[str]:
        return ["spin"]

    @property
    def house_edge(self) -> float:
        return 8.0  # Approximate for this configuration

    def play_round(self, bet: Bet) -> tuple[BetResult, dict[str, object]]:
        self.validate_bet_type(bet.bet_type)

        reels = self._spin()
        payout_multiplier = self._calculate_payout(reels)
        payout = bet.amount * payout_multiplier

        if payout_multiplier > 0:
            outcome = BetOutcome.WIN
        else:
            outcome = BetOutcome.LOSE

        result = BetResult(bet=bet, outcome=outcome, payout=payout, net=payout - bet.amount)
        details: dict[str, object] = {
            "reels": reels,
            "payout_multiplier": payout_multiplier,
        }
        return result, details

    def _spin(self) -> list[str]:
        """Spin three independent reels."""
        return self._rng.choices(SYMBOL_NAMES, weights=SYMBOL_WEIGHTS, k=3)

    def _calculate_payout(self, reels: list[str]) -> int:
        """Calculate payout multiplier based on reel results."""
        if reels[0] == reels[1] == reels[2]:
            return SYMBOLS[reels[0]]["payout_3"]
        if reels[0] == reels[1] or reels[1] == reels[2] or reels[0] == reels[2]:
            # Find the matching symbol
            if reels[0] == reels[1]:
                sym = reels[0]
            elif reels[1] == reels[2]:
                sym = reels[1]
            else:
                sym = reels[0]
            return SYMBOLS[sym]["payout_2"]
        return 0
