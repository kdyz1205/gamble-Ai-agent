"""Roulette game engine (American double-zero)."""

from __future__ import annotations

import random

from gamble_agent.domain.models import Bet, BetOutcome, BetResult, GameType
from gamble_agent.games.base import GameEngine

# American roulette: 0, 00, 1-36
RED_NUMBERS = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}
BLACK_NUMBERS = {2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35}
ALL_NUMBERS = list(range(0, 37)) + [-1]  # -1 represents "00"

BET_TYPES = {
    "red": {"payout": 2, "numbers": RED_NUMBERS},
    "black": {"payout": 2, "numbers": BLACK_NUMBERS},
    "odd": {"payout": 2, "numbers": {n for n in range(1, 37) if n % 2 == 1}},
    "even": {"payout": 2, "numbers": {n for n in range(1, 37) if n % 2 == 0}},
    "high": {"payout": 2, "numbers": set(range(19, 37))},
    "low": {"payout": 2, "numbers": set(range(1, 19))},
    "dozen_1": {"payout": 3, "numbers": set(range(1, 13))},
    "dozen_2": {"payout": 3, "numbers": set(range(13, 25))},
    "dozen_3": {"payout": 3, "numbers": set(range(25, 37))},
    "column_1": {"payout": 3, "numbers": {n for n in range(1, 37) if n % 3 == 1}},
    "column_2": {"payout": 3, "numbers": {n for n in range(1, 37) if n % 3 == 2}},
    "column_3": {"payout": 3, "numbers": {n for n in range(1, 37) if n % 3 == 0}},
    "straight_0": {"payout": 36, "numbers": {0}},
    "straight_00": {"payout": 36, "numbers": {-1}},
}


class RouletteEngine(GameEngine):
    """American roulette with standard bet types."""

    def __init__(self, rng: random.Random | None = None) -> None:
        self._rng = rng or random.Random()

    @property
    def game_type(self) -> GameType:
        return GameType.ROULETTE

    @property
    def valid_bet_types(self) -> list[str]:
        return list(BET_TYPES.keys())

    @property
    def house_edge(self) -> float:
        return 5.26  # American roulette

    def play_round(self, bet: Bet) -> tuple[BetResult, dict[str, object]]:
        self.validate_bet_type(bet.bet_type)

        spin = self._rng.choice(ALL_NUMBERS)
        bet_info = BET_TYPES[bet.bet_type]
        winning_numbers: set[int] = bet_info["numbers"]

        if spin in winning_numbers:
            payout_multiplier: int = bet_info["payout"]
            payout = bet.amount * payout_multiplier
            outcome = BetOutcome.WIN
        else:
            payout = 0.0
            outcome = BetOutcome.LOSE

        result = BetResult(
            bet=bet,
            outcome=outcome,
            payout=payout,
            net=payout - bet.amount,
        )
        details: dict[str, object] = {
            "spin_result": spin,
            "spin_display": "00" if spin == -1 else str(spin),
            "spin_color": "red" if spin in RED_NUMBERS else ("black" if spin in BLACK_NUMBERS else "green"),
        }
        return result, details
