"""Tests for game engines."""

import random

import pytest

from gamble_agent.domain.models import Bet, BetOutcome, GameType
from gamble_agent.games.blackjack import BlackjackEngine, _hand_value, _is_blackjack
from gamble_agent.games.dice import DiceEngine
from gamble_agent.games.roulette import RouletteEngine
from gamble_agent.games.slots import SlotsEngine


class TestBlackjack:
    def test_game_type(self):
        engine = BlackjackEngine()
        assert engine.game_type == GameType.BLACKJACK

    def test_valid_bet_types(self):
        engine = BlackjackEngine()
        assert "standard" in engine.valid_bet_types

    def test_invalid_bet_type(self):
        engine = BlackjackEngine()
        with pytest.raises(ValueError, match="Invalid bet type"):
            engine.play_round(Bet(amount=10, bet_type="invalid"))

    def test_hand_value_simple(self):
        assert _hand_value(["5_hearts", "3_clubs"]) == 8

    def test_hand_value_face_cards(self):
        assert _hand_value(["K_hearts", "Q_clubs"]) == 20

    def test_hand_value_ace_high(self):
        assert _hand_value(["A_hearts", "5_clubs"]) == 16

    def test_hand_value_ace_low(self):
        assert _hand_value(["A_hearts", "9_clubs", "5_diamonds"]) == 15

    def test_is_blackjack(self):
        assert _is_blackjack(["A_hearts", "K_clubs"]) is True
        assert _is_blackjack(["A_hearts", "5_clubs"]) is False
        assert _is_blackjack(["A_hearts", "5_clubs", "5_diamonds"]) is False

    def test_deterministic_with_seed(self):
        rng = random.Random(42)
        engine = BlackjackEngine(rng=rng)
        result1, details1 = engine.play_round(Bet(amount=10, bet_type="standard"))

        rng2 = random.Random(42)
        engine2 = BlackjackEngine(rng=rng2)
        result2, details2 = engine2.play_round(Bet(amount=10, bet_type="standard"))
        assert result1.outcome == result2.outcome
        assert result1.payout == result2.payout
        assert details1["player_hand"] == details2["player_hand"]

    def test_play_round_returns_valid_result(self):
        engine = BlackjackEngine(rng=random.Random(1))
        bet = Bet(amount=10, bet_type="standard")
        result, details = engine.play_round(bet)
        assert result.outcome in (BetOutcome.WIN, BetOutcome.LOSE, BetOutcome.PUSH)
        assert "player_hand" in details
        assert "dealer_hand" in details


class TestRoulette:
    def test_game_type(self):
        assert RouletteEngine().game_type == GameType.ROULETTE

    def test_valid_bet_types(self):
        engine = RouletteEngine()
        assert "red" in engine.valid_bet_types
        assert "black" in engine.valid_bet_types

    def test_invalid_bet_type(self):
        with pytest.raises(ValueError):
            RouletteEngine().play_round(Bet(amount=10, bet_type="purple"))

    def test_red_win(self):
        # Seed that gives a red number
        for seed in range(100):
            rng = random.Random(seed)
            engine = RouletteEngine(rng=rng)
            result, details = engine.play_round(Bet(amount=10, bet_type="red"))
            if details["spin_color"] == "red":
                assert result.outcome == BetOutcome.WIN
                assert result.payout == 20.0
                return
        pytest.fail("Could not find a seed that produces a red result")

    def test_deterministic(self):
        for seed in [1, 42, 99]:
            r1, _ = RouletteEngine(rng=random.Random(seed)).play_round(
                Bet(amount=10, bet_type="red")
            )
            r2, _ = RouletteEngine(rng=random.Random(seed)).play_round(
                Bet(amount=10, bet_type="red")
            )
            assert r1.outcome == r2.outcome


class TestDice:
    def test_game_type(self):
        assert DiceEngine().game_type == GameType.DICE

    def test_valid_bet_types(self):
        engine = DiceEngine()
        assert "pass" in engine.valid_bet_types
        assert "dont_pass" in engine.valid_bet_types

    def test_play_round_returns_valid(self):
        engine = DiceEngine(rng=random.Random(42))
        result, details = engine.play_round(Bet(amount=10, bet_type="pass"))
        assert result.outcome in (BetOutcome.WIN, BetOutcome.LOSE, BetOutcome.PUSH)
        assert "rolls" in details
        assert len(details["rolls"]) >= 1

    def test_deterministic(self):
        r1, _ = DiceEngine(rng=random.Random(42)).play_round(
            Bet(amount=10, bet_type="pass")
        )
        r2, _ = DiceEngine(rng=random.Random(42)).play_round(
            Bet(amount=10, bet_type="pass")
        )
        assert r1.outcome == r2.outcome


class TestSlots:
    def test_game_type(self):
        assert SlotsEngine().game_type == GameType.SLOTS

    def test_valid_bet_types(self):
        assert "spin" in SlotsEngine().valid_bet_types

    def test_play_round_returns_valid(self):
        engine = SlotsEngine(rng=random.Random(42))
        result, details = engine.play_round(Bet(amount=10, bet_type="spin"))
        assert result.outcome in (BetOutcome.WIN, BetOutcome.LOSE)
        assert "reels" in details
        assert len(details["reels"]) == 3

    def test_three_matching_wins(self):
        # Find a seed that gives three matching symbols
        for seed in range(1000):
            engine = SlotsEngine(rng=random.Random(seed))
            result, details = engine.play_round(Bet(amount=10, bet_type="spin"))
            reels = details["reels"]
            if reels[0] == reels[1] == reels[2]:
                assert result.outcome == BetOutcome.WIN
                assert result.payout > 0
                return
        pytest.fail("Could not find 3-match seed in 1000 tries")
