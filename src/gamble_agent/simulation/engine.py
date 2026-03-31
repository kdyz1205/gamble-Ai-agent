"""Core simulation engine that orchestrates games, strategies, and bankroll."""

from __future__ import annotations

import structlog

from gamble_agent.domain.bankroll import BankrollManager, InsufficientFundsError
from gamble_agent.domain.models import Bet, BetOutcome, GameRound, GameType, SessionStats
from gamble_agent.games.base import GameEngine
from gamble_agent.strategies.base import BettingStrategy

logger = structlog.get_logger()


class SimulationEngine:
    """Runs a single simulation session: one game, one strategy, one bankroll."""

    def __init__(
        self,
        game: GameEngine,
        strategy: BettingStrategy,
        bankroll: BankrollManager,
    ) -> None:
        self._game = game
        self._strategy = strategy
        self._bankroll = bankroll
        self._rounds: list[GameRound] = []

    @property
    def rounds(self) -> list[GameRound]:
        return list(self._rounds)

    def run(self, num_rounds: int) -> SessionStats:
        """Run the simulation for the specified number of rounds.

        Returns session statistics when complete.
        """
        if num_rounds < 1:
            raise ValueError("Number of rounds must be at least 1")

        logger.info(
            "simulation_start",
            game=self._game.game_type.value,
            strategy=self._strategy.name,
            bankroll=self._bankroll.balance,
            rounds=num_rounds,
        )

        wins = 0
        losses = 0
        pushes = 0
        total_wagered = 0.0
        bust_round: int | None = None

        for round_num in range(1, num_rounds + 1):
            if self._bankroll.should_stop:
                if self._bankroll.is_bust and bust_round is None:
                    bust_round = round_num
                logger.info(
                    "simulation_early_stop",
                    round=round_num,
                    reason="bankroll_limit",
                    balance=self._bankroll.balance,
                )
                break

            # Get bet parameters from strategy
            bet_type = self._strategy.next_bet_type()
            raw_amount = self._strategy.next_bet_amount(self._bankroll)

            try:
                amount = self._bankroll.validate_bet(raw_amount)
            except (InsufficientFundsError, ValueError):
                if bust_round is None:
                    bust_round = round_num
                break

            bankroll_before = self._bankroll.balance

            # Place bet and play round
            bet = Bet(amount=amount, bet_type=bet_type)
            self._bankroll.debit(amount)
            result, details = self._game.play_round(bet)

            # Credit payout
            if result.payout > 0:
                self._bankroll.credit(result.payout)

            self._bankroll.record_snapshot()

            # Track stats
            total_wagered += amount
            if result.outcome == BetOutcome.WIN:
                wins += 1
            elif result.outcome == BetOutcome.LOSE:
                losses += 1
            else:
                pushes += 1

            # Record round
            game_round = GameRound(
                game_type=self._game.game_type,
                round_number=round_num,
                bets=[result],
                bankroll_before=bankroll_before,
                bankroll_after=self._bankroll.balance,
                details=details,
            )
            self._rounds.append(game_round)

            # Update strategy with result
            self._strategy.update(result)

        stats = SessionStats(
            game_type=self._game.game_type,
            strategy_name=self._strategy.name,
            initial_bankroll=self._bankroll.initial_bankroll,
            final_bankroll=self._bankroll.balance,
            total_rounds=len(self._rounds),
            wins=wins,
            losses=losses,
            pushes=pushes,
            total_wagered=total_wagered,
            peak_bankroll=self._bankroll.peak,
            min_bankroll=self._bankroll.trough,
            bust_round=bust_round,
        )

        logger.info(
            "simulation_complete",
            rounds_played=stats.total_rounds,
            net_profit=stats.net_profit,
            win_rate=f"{stats.win_rate:.2%}",
            roi=f"{stats.roi:.2f}%",
        )

        return stats
