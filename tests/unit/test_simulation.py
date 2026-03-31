"""Tests for simulation engine and runner."""

import pytest

from gamble_agent.domain.models import GameType
from gamble_agent.simulation.engine import SimulationEngine
from gamble_agent.simulation.runner import SimulationConfig, SimulationRunner
from gamble_agent.strategies.fixed import FixedBetStrategy
from gamble_agent.strategies.martingale import MartingaleStrategy
from gamble_agent.domain.bankroll import BankrollManager
from gamble_agent.games.roulette import RouletteEngine
import random


class TestSimulationEngine:
    def test_runs_requested_rounds(self):
        rng = random.Random(42)
        game = RouletteEngine(rng=rng)
        strategy = FixedBetStrategy(bet_amount=10, bet_type="red")
        bankroll = BankrollManager(initial_bankroll=10000)
        engine = SimulationEngine(game=game, strategy=strategy, bankroll=bankroll)

        stats = engine.run(100)
        assert stats.total_rounds == 100
        assert stats.wins + stats.losses + stats.pushes == 100

    def test_stops_on_bust(self):
        rng = random.Random(42)
        game = RouletteEngine(rng=rng)
        strategy = FixedBetStrategy(bet_amount=100, bet_type="red")
        bankroll = BankrollManager(initial_bankroll=200, min_bet=100)
        engine = SimulationEngine(game=game, strategy=strategy, bankroll=bankroll)

        stats = engine.run(1000)
        assert stats.total_rounds < 1000  # Should bust before 1000

    def test_invalid_rounds_rejected(self):
        rng = random.Random(42)
        game = RouletteEngine(rng=rng)
        strategy = FixedBetStrategy(bet_amount=10, bet_type="red")
        bankroll = BankrollManager(initial_bankroll=1000)
        engine = SimulationEngine(game=game, strategy=strategy, bankroll=bankroll)

        with pytest.raises(ValueError, match="at least 1"):
            engine.run(0)

    def test_deterministic_results(self):
        def run_sim():
            rng = random.Random(99)
            game = RouletteEngine(rng=rng)
            strategy = FixedBetStrategy(bet_amount=10, bet_type="red")
            bankroll = BankrollManager(initial_bankroll=1000)
            engine = SimulationEngine(game=game, strategy=strategy, bankroll=bankroll)
            return engine.run(50)

        s1 = run_sim()
        s2 = run_sim()
        assert s1.final_bankroll == s2.final_bankroll
        assert s1.wins == s2.wins

    def test_stats_computed_correctly(self):
        rng = random.Random(42)
        game = RouletteEngine(rng=rng)
        strategy = FixedBetStrategy(bet_amount=10, bet_type="red")
        bankroll = BankrollManager(initial_bankroll=1000)
        engine = SimulationEngine(game=game, strategy=strategy, bankroll=bankroll)

        stats = engine.run(50)
        assert stats.initial_bankroll == 1000
        assert stats.total_wagered == 50 * 10
        assert stats.game_type == GameType.ROULETTE
        assert stats.strategy_name == "fixed_10"


class TestSimulationRunner:
    def test_run_single(self):
        config = SimulationConfig(
            game_type=GameType.ROULETTE,
            num_rounds=100,
            initial_bankroll=1000,
            seed=42,
        )
        strategy = FixedBetStrategy(bet_amount=10, bet_type="red")
        runner = SimulationRunner()
        stats = runner.run_single(config, strategy)
        assert stats.total_rounds == 100

    def test_run_batch(self):
        config = SimulationConfig(
            game_type=GameType.ROULETTE,
            num_rounds=50,
            initial_bankroll=1000,
            seed=42,
        )
        strategy = FixedBetStrategy(bet_amount=10, bet_type="red")
        runner = SimulationRunner()
        batch = runner.run_batch(config, strategy, num_simulations=10)
        assert batch.num_simulations == 10
        assert len(batch.results) == 10

    def test_batch_invalid_count(self):
        config = SimulationConfig(game_type=GameType.ROULETTE)
        strategy = FixedBetStrategy(bet_amount=10, bet_type="red")
        runner = SimulationRunner()
        with pytest.raises(ValueError):
            runner.run_batch(config, strategy, num_simulations=0)
