"""Dice (Craps-inspired) game engine with pass/don't-pass bets."""

from __future__ import annotations

import random

from gamble_agent.domain.models import Bet, BetOutcome, BetResult, GameType
from gamble_agent.games.base import GameEngine


class DiceEngine(GameEngine):
    """Simplified craps: pass line and don't-pass line bets only."""

    def __init__(self, rng: random.Random | None = None) -> None:
        self._rng = rng or random.Random()

    @property
    def game_type(self) -> GameType:
        return GameType.DICE

    @property
    def valid_bet_types(self) -> list[str]:
        return ["pass", "dont_pass"]

    @property
    def house_edge(self) -> float:
        return 1.41  # Pass line

    def play_round(self, bet: Bet) -> tuple[BetResult, dict[str, object]]:
        self.validate_bet_type(bet.bet_type)
        is_pass = bet.bet_type == "pass"

        rolls: list[tuple[int, int]] = []
        come_out = self._roll()
        rolls.append(come_out)
        total = sum(come_out)

        # Come-out roll
        if total in (7, 11):
            won = is_pass
        elif total in (2, 3, 12):
            if total == 12 and not is_pass:
                # 12 on dont_pass is a push (bar 12)
                return self._make_result(bet, BetOutcome.PUSH, bet.amount, rolls, total, None)
            won = not is_pass
        else:
            # Establish point
            point = total
            while True:
                roll = self._roll()
                rolls.append(roll)
                roll_total = sum(roll)
                if roll_total == point:
                    won = is_pass
                    break
                elif roll_total == 7:
                    won = not is_pass
                    break

            return self._make_result(
                bet,
                BetOutcome.WIN if won else BetOutcome.LOSE,
                bet.amount * 2 if won else 0.0,
                rolls,
                total,
                point,
            )

        payout = bet.amount * 2 if won else 0.0
        outcome = BetOutcome.WIN if won else BetOutcome.LOSE
        return self._make_result(bet, outcome, payout, rolls, total, None)

    def _roll(self) -> tuple[int, int]:
        return (self._rng.randint(1, 6), self._rng.randint(1, 6))

    def _make_result(
        self,
        bet: Bet,
        outcome: BetOutcome,
        payout: float,
        rolls: list[tuple[int, int]],
        come_out_total: int,
        point: int | None,
    ) -> tuple[BetResult, dict[str, object]]:
        result = BetResult(bet=bet, outcome=outcome, payout=payout, net=payout - bet.amount)
        details: dict[str, object] = {
            "rolls": rolls,
            "come_out_total": come_out_total,
            "point": point,
            "num_rolls": len(rolls),
        }
        return result, details
