"""Tests for domain models."""

import pytest
from pydantic import ValidationError

from gamble_agent.domain.models import (
    Bet,
    BetOutcome,
    BetResult,
    GameRound,
    GameType,
    SessionStats,
)


class TestBet:
    def test_create_valid_bet(self):
        bet = Bet(amount=10.0, bet_type="standard")
        assert bet.amount == 10.0
        assert bet.bet_type == "standard"
        assert bet.id is not None

    def test_reject_zero_amount(self):
        with pytest.raises(ValidationError):
            Bet(amount=0, bet_type="standard")

    def test_reject_negative_amount(self):
        with pytest.raises(ValidationError):
            Bet(amount=-5, bet_type="standard")

    def test_reject_nan_amount(self):
        with pytest.raises(ValidationError):
            Bet(amount=float("nan"), bet_type="standard")

    def test_reject_inf_amount(self):
        with pytest.raises(ValidationError):
            Bet(amount=float("inf"), bet_type="standard")


class TestBetResult:
    def test_win_result(self):
        bet = Bet(amount=10.0, bet_type="standard")
        result = BetResult(bet=bet, outcome=BetOutcome.WIN, payout=20.0, net=10.0)
        assert result.is_win is True
        assert result.payout == 20.0
        assert result.net == 10.0

    def test_lose_result(self):
        bet = Bet(amount=10.0, bet_type="standard")
        result = BetResult(bet=bet, outcome=BetOutcome.LOSE, payout=0, net=-10.0)
        assert result.is_win is False

    def test_push_result(self):
        bet = Bet(amount=10.0, bet_type="standard")
        result = BetResult(bet=bet, outcome=BetOutcome.PUSH, payout=10.0, net=0.0)
        assert result.is_win is False
        assert result.net == 0.0


class TestGameRound:
    def test_net_result(self):
        round_ = GameRound(
            game_type=GameType.BLACKJACK,
            round_number=1,
            bankroll_before=1000,
            bankroll_after=1010,
        )
        assert round_.net_result == 10.0

    def test_total_wagered(self):
        bet = Bet(amount=10.0, bet_type="standard")
        result = BetResult(bet=bet, outcome=BetOutcome.WIN, payout=20.0, net=10.0)
        round_ = GameRound(
            game_type=GameType.BLACKJACK,
            round_number=1,
            bets=[result],
            bankroll_before=1000,
            bankroll_after=1010,
        )
        assert round_.total_wagered == 10.0


class TestSessionStats:
    def test_computed_properties(self):
        stats = SessionStats(
            game_type=GameType.BLACKJACK,
            strategy_name="fixed",
            initial_bankroll=1000,
            final_bankroll=1100,
            total_rounds=100,
            wins=55,
            losses=40,
            pushes=5,
            total_wagered=1000,
            peak_bankroll=1200,
            min_bankroll=900,
        )
        assert stats.net_profit == 100.0
        assert stats.win_rate == 0.55
        assert stats.roi == 10.0
        assert stats.house_edge_observed == -10.0  # negative = player edge

    def test_zero_division_safety(self):
        stats = SessionStats(
            game_type=GameType.DICE,
            strategy_name="fixed",
            initial_bankroll=0,
            final_bankroll=0,
            total_rounds=0,
            wins=0,
            losses=0,
            pushes=0,
            total_wagered=0,
            peak_bankroll=0,
            min_bankroll=0,
        )
        assert stats.win_rate == 0.0
        assert stats.roi == 0.0
        assert stats.house_edge_observed == 0.0
