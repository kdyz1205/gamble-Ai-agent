"""High-level simulation runner for batch simulations and comparisons."""

from __future__ import annotations

import random
from dataclasses import dataclass, field

import structlog

from gamble_agent.domain.bankroll import BankrollManager
from gamble_agent.domain.models import GameType, SessionStats
from gamble_agent.games.registry import get_engine_class
from gamble_agent.simulation.engine import SimulationEngine
from gamble_agent.strategies.base import BettingStrategy

logger = structlog.get_logger()


@dataclass
class SimulationConfig:
    """Configuration for a simulation run."""

    game_type: GameType
    num_rounds: int = 1000
    initial_bankroll: float = 10000.0
    min_bet: float = 1.0
    max_bet: float = 10000.0
    stop_loss_pct: float = 0.0
    take_profit_pct: float = 0.0
    seed: int | None = None


@dataclass
class BatchResult:
    """Results from a batch of simulation runs."""

    config: SimulationConfig
    strategy_name: str
    results: list[SessionStats] = field(default_factory=list)

    @property
    def num_simulations(self) -> int:
        return len(self.results)

    @property
    def avg_net_profit(self) -> float:
        if not self.results:
            return 0.0
        return sum(r.net_profit for r in self.results) / len(self.results)

    @property
    def avg_win_rate(self) -> float:
        if not self.results:
            return 0.0
        return sum(r.win_rate for r in self.results) / len(self.results)

    @property
    def bust_rate(self) -> float:
        if not self.results:
            return 0.0
        busts = sum(1 for r in self.results if r.bust_round is not None)
        return busts / len(self.results)

    @property
    def avg_roi(self) -> float:
        if not self.results:
            return 0.0
        return sum(r.roi for r in self.results) / len(self.results)


class SimulationRunner:
    """Run single or batch simulations with different configurations."""

    def run_single(
        self,
        config: SimulationConfig,
        strategy: BettingStrategy,
    ) -> SessionStats:
        """Run a single simulation."""
        rng = random.Random(config.seed)
        game_cls = get_engine_class(config.game_type)
        game = game_cls(rng=rng)

        bankroll = BankrollManager(
            initial_bankroll=config.initial_bankroll,
            min_bet=config.min_bet,
            max_bet=config.max_bet,
            stop_loss_pct=config.stop_loss_pct,
            take_profit_pct=config.take_profit_pct,
        )

        engine = SimulationEngine(game=game, strategy=strategy, bankroll=bankroll)
        return engine.run(config.num_rounds)

    def run_batch(
        self,
        config: SimulationConfig,
        strategy: BettingStrategy,
        num_simulations: int = 100,
    ) -> BatchResult:
        """Run multiple simulations and aggregate results."""
        if num_simulations < 1:
            raise ValueError("Number of simulations must be at least 1")

        batch = BatchResult(config=config, strategy_name=strategy.name)

        for i in range(num_simulations):
            # Each simulation gets a different seed derived from base
            sim_config = SimulationConfig(
                game_type=config.game_type,
                num_rounds=config.num_rounds,
                initial_bankroll=config.initial_bankroll,
                min_bet=config.min_bet,
                max_bet=config.max_bet,
                stop_loss_pct=config.stop_loss_pct,
                take_profit_pct=config.take_profit_pct,
                seed=(config.seed or 0) + i,
            )
            strategy.reset()
            result = self.run_single(sim_config, strategy)
            batch.results.append(result)

        logger.info(
            "batch_complete",
            strategy=strategy.name,
            simulations=num_simulations,
            avg_profit=f"{batch.avg_net_profit:.2f}",
            bust_rate=f"{batch.bust_rate:.2%}",
        )

        return batch
