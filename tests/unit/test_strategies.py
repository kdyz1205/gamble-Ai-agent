"""Tests for betting strategies."""

import pytest

from gamble_agent.domain.bankroll import BankrollManager
from gamble_agent.domain.models import Bet, BetOutcome, BetResult
from gamble_agent.strategies.anti_martingale import AntiMartingaleStrategy
from gamble_agent.strategies.dalembert import DAlembertStrategy
from gamble_agent.strategies.fixed import FixedBetStrategy
from gamble_agent.strategies.kelly import KellyCriterionStrategy
from gamble_agent.strategies.martingale import MartingaleStrategy
from gamble_agent.strategies.percentage import PercentageBetStrategy
from gamble_agent.strategies.registry import StrategyRegistry, get_strategy


def _make_result(outcome: BetOutcome, amount: float = 10.0) -> BetResult:
    bet = Bet(amount=amount, bet_type="standard")
    payout = amount * 2 if outcome == BetOutcome.WIN else (amount if outcome == BetOutcome.PUSH else 0)
    return BetResult(bet=bet, outcome=outcome, payout=payout, net=payout - amount)


class TestFixedStrategy:
    def test_constant_bet(self):
        s = FixedBetStrategy(bet_amount=25)
        bm = BankrollManager(initial_bankroll=1000)
        assert s.next_bet_amount(bm) == 25
        s.update(_make_result(BetOutcome.WIN))
        assert s.next_bet_amount(bm) == 25
        s.update(_make_result(BetOutcome.LOSE))
        assert s.next_bet_amount(bm) == 25

    def test_reject_zero(self):
        with pytest.raises(ValueError):
            FixedBetStrategy(bet_amount=0)


class TestMartingaleStrategy:
    def test_doubles_on_loss(self):
        s = MartingaleStrategy(base_bet=10)
        bm = BankrollManager(initial_bankroll=10000)
        assert s.next_bet_amount(bm) == 10

        s.update(_make_result(BetOutcome.LOSE))
        assert s.next_bet_amount(bm) == 20

        s.update(_make_result(BetOutcome.LOSE))
        assert s.next_bet_amount(bm) == 40

    def test_resets_on_win(self):
        s = MartingaleStrategy(base_bet=10)
        bm = BankrollManager(initial_bankroll=10000)
        s.update(_make_result(BetOutcome.LOSE))
        s.update(_make_result(BetOutcome.LOSE))
        assert s.next_bet_amount(bm) == 40

        s.update(_make_result(BetOutcome.WIN))
        assert s.next_bet_amount(bm) == 10

    def test_max_multiplier_cap(self):
        s = MartingaleStrategy(base_bet=10, max_multiplier=4)
        bm = BankrollManager(initial_bankroll=10000)
        for _ in range(10):
            s.update(_make_result(BetOutcome.LOSE))
        assert s.next_bet_amount(bm) == 40  # capped at 4x

    def test_reset(self):
        s = MartingaleStrategy(base_bet=10)
        bm = BankrollManager(initial_bankroll=10000)
        s.update(_make_result(BetOutcome.LOSE))
        s.update(_make_result(BetOutcome.LOSE))
        s.reset()
        assert s.next_bet_amount(bm) == 10


class TestAntiMartingaleStrategy:
    def test_doubles_on_win(self):
        s = AntiMartingaleStrategy(base_bet=10, max_streak=5)
        bm = BankrollManager(initial_bankroll=10000)
        assert s.next_bet_amount(bm) == 10

        s.update(_make_result(BetOutcome.WIN))
        assert s.next_bet_amount(bm) == 20

        s.update(_make_result(BetOutcome.WIN))
        assert s.next_bet_amount(bm) == 40

    def test_resets_on_loss(self):
        s = AntiMartingaleStrategy(base_bet=10)
        bm = BankrollManager(initial_bankroll=10000)
        s.update(_make_result(BetOutcome.WIN))
        s.update(_make_result(BetOutcome.LOSE))
        assert s.next_bet_amount(bm) == 10

    def test_resets_at_max_streak(self):
        s = AntiMartingaleStrategy(base_bet=10, max_streak=2)
        bm = BankrollManager(initial_bankroll=10000)
        s.update(_make_result(BetOutcome.WIN))
        s.update(_make_result(BetOutcome.WIN))
        assert s.next_bet_amount(bm) == 10  # reset after 2 wins


class TestKellyCriterion:
    def test_positive_edge_bets_fraction(self):
        s = KellyCriterionStrategy(win_prob=0.6, payout_odds=1.0, fraction=1.0)
        bm = BankrollManager(initial_bankroll=1000)
        # Kelly = (1*0.6 - 0.4)/1 = 0.2, so bet = 1000 * 0.2 * 1.0 = 200
        assert abs(s.next_bet_amount(bm) - 200.0) < 0.01

    def test_negative_edge_bets_minimum(self):
        s = KellyCriterionStrategy(win_prob=0.4, payout_odds=1.0, fraction=1.0, min_bet=5)
        bm = BankrollManager(initial_bankroll=1000)
        assert s.next_bet_amount(bm) == 5.0  # Kelly is negative, bet min

    def test_fractional_kelly(self):
        s = KellyCriterionStrategy(win_prob=0.6, payout_odds=1.0, fraction=0.5)
        bm = BankrollManager(initial_bankroll=1000)
        # Kelly = 0.2, fractional = 0.2 * 0.5 = 0.1, bet = 100
        assert abs(s.next_bet_amount(bm) - 100.0) < 0.01

    def test_adapts_after_observations(self):
        s = KellyCriterionStrategy(win_prob=0.5, payout_odds=1.0, fraction=1.0, min_bet=1)
        # Feed 30 wins out of 30 to exceed the threshold
        for _ in range(30):
            s.update(_make_result(BetOutcome.WIN))
        assert s.estimated_win_prob == 1.0

    def test_reject_invalid_params(self):
        with pytest.raises(ValueError):
            KellyCriterionStrategy(win_prob=0)
        with pytest.raises(ValueError):
            KellyCriterionStrategy(win_prob=1.0)
        with pytest.raises(ValueError):
            KellyCriterionStrategy(payout_odds=0)
        with pytest.raises(ValueError):
            KellyCriterionStrategy(fraction=0)


class TestDAlembertStrategy:
    def test_increases_on_loss(self):
        s = DAlembertStrategy(base_bet=10, unit=5)
        bm = BankrollManager(initial_bankroll=10000)
        assert s.next_bet_amount(bm) == 10

        s.update(_make_result(BetOutcome.LOSE))
        assert s.next_bet_amount(bm) == 15

        s.update(_make_result(BetOutcome.LOSE))
        assert s.next_bet_amount(bm) == 20

    def test_decreases_on_win(self):
        s = DAlembertStrategy(base_bet=10, unit=5)
        bm = BankrollManager(initial_bankroll=10000)
        s.update(_make_result(BetOutcome.LOSE))
        s.update(_make_result(BetOutcome.LOSE))
        assert s.next_bet_amount(bm) == 20

        s.update(_make_result(BetOutcome.WIN))
        assert s.next_bet_amount(bm) == 15

    def test_never_goes_below_base(self):
        s = DAlembertStrategy(base_bet=10, unit=5)
        bm = BankrollManager(initial_bankroll=10000)
        s.update(_make_result(BetOutcome.WIN))
        assert s.next_bet_amount(bm) == 10  # stays at base

    def test_reset(self):
        s = DAlembertStrategy(base_bet=10, unit=5)
        bm = BankrollManager(initial_bankroll=10000)
        s.update(_make_result(BetOutcome.LOSE))
        s.update(_make_result(BetOutcome.LOSE))
        s.reset()
        assert s.next_bet_amount(bm) == 10

    def test_reject_invalid_params(self):
        with pytest.raises(ValueError):
            DAlembertStrategy(base_bet=0)
        with pytest.raises(ValueError):
            DAlembertStrategy(unit=0)


class TestPercentageBetStrategy:
    def test_bets_percentage_of_bankroll(self):
        s = PercentageBetStrategy(percentage=5.0, min_bet=1)
        bm = BankrollManager(initial_bankroll=1000)
        assert s.next_bet_amount(bm) == 50.0

    def test_scales_with_bankroll(self):
        s = PercentageBetStrategy(percentage=10.0, min_bet=1)
        bm = BankrollManager(initial_bankroll=1000)
        assert s.next_bet_amount(bm) == 100.0
        bm.debit(500)
        assert s.next_bet_amount(bm) == 50.0

    def test_respects_min_bet(self):
        s = PercentageBetStrategy(percentage=1.0, min_bet=5)
        bm = BankrollManager(initial_bankroll=100)
        assert s.next_bet_amount(bm) == 5.0  # 1% of 100 = 1, but min is 5

    def test_reject_invalid_percentage(self):
        with pytest.raises(ValueError):
            PercentageBetStrategy(percentage=0)
        with pytest.raises(ValueError):
            PercentageBetStrategy(percentage=101)

    def test_reject_invalid_min_bet(self):
        with pytest.raises(ValueError):
            PercentageBetStrategy(min_bet=0)


class TestStrategyRegistry:
    def test_get_known_strategy(self):
        s = StrategyRegistry.get("fixed", bet_amount=10.0)
        assert isinstance(s, FixedBetStrategy)

    def test_unknown_strategy_raises(self):
        with pytest.raises(ValueError, match="Unknown strategy"):
            StrategyRegistry.get("nonexistent")

    def test_available_lists_all(self):
        avail = StrategyRegistry.available()
        assert "fixed" in avail
        assert "martingale" in avail
        assert "kelly" in avail

    def test_get_strategy_convenience(self):
        s = get_strategy("martingale", base_bet=5.0)
        assert isinstance(s, MartingaleStrategy)
