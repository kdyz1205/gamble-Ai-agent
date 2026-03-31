"""Tests for bankroll management."""

import pytest

from gamble_agent.domain.bankroll import BankrollManager, InsufficientFundsError


class TestBankrollManager:
    def test_initial_state(self):
        bm = BankrollManager(initial_bankroll=1000)
        assert bm.balance == 1000
        assert bm.initial_bankroll == 1000
        assert bm.peak == 1000
        assert bm.trough == 1000
        assert bm.net_profit == 0
        assert bm.is_bust is False

    def test_reject_invalid_bankroll(self):
        with pytest.raises(ValueError, match="positive"):
            BankrollManager(initial_bankroll=0)
        with pytest.raises(ValueError, match="positive"):
            BankrollManager(initial_bankroll=-100)

    def test_reject_invalid_bet_limits(self):
        with pytest.raises(ValueError, match="positive"):
            BankrollManager(initial_bankroll=1000, min_bet=0)
        with pytest.raises(ValueError, match="cannot exceed"):
            BankrollManager(initial_bankroll=1000, min_bet=100, max_bet=10)

    def test_debit_and_credit(self):
        bm = BankrollManager(initial_bankroll=1000)
        bm.debit(100)
        assert bm.balance == 900
        bm.credit(200)
        assert bm.balance == 1100

    def test_debit_insufficient_funds(self):
        bm = BankrollManager(initial_bankroll=100)
        with pytest.raises(InsufficientFundsError):
            bm.debit(200)

    def test_credit_negative_rejected(self):
        bm = BankrollManager(initial_bankroll=100)
        with pytest.raises(ValueError, match="negative"):
            bm.credit(-10)

    def test_validate_bet_clamps(self):
        bm = BankrollManager(initial_bankroll=1000, min_bet=5, max_bet=100)
        assert bm.validate_bet(1) == 5  # Clamped up to min
        assert bm.validate_bet(200) == 100  # Clamped down to max
        assert bm.validate_bet(50) == 50  # No clamping

    def test_validate_bet_insufficient(self):
        bm = BankrollManager(initial_bankroll=10, min_bet=5, max_bet=100)
        with pytest.raises(InsufficientFundsError):
            bm.validate_bet(50)

    def test_record_snapshot_tracks_peak_trough(self):
        bm = BankrollManager(initial_bankroll=1000)
        bm.credit(500)
        bm.record_snapshot()
        assert bm.peak == 1500

        bm.debit(1000)
        bm.record_snapshot()
        assert bm.trough == 500

    def test_history(self):
        bm = BankrollManager(initial_bankroll=1000)
        bm.credit(100)
        bm.record_snapshot()
        bm.debit(200)
        bm.record_snapshot()
        assert bm.history == [1000, 1100, 900]

    def test_stop_loss(self):
        bm = BankrollManager(initial_bankroll=1000, stop_loss_pct=50)
        assert bm.should_stop is False
        bm.debit(600)
        bm.record_snapshot()
        assert bm.should_stop is True  # balance 400 <= 500 (50% of 1000)

    def test_take_profit(self):
        bm = BankrollManager(initial_bankroll=1000, take_profit_pct=50)
        assert bm.should_stop is False
        bm.credit(600)
        bm.record_snapshot()
        assert bm.should_stop is True  # balance 1600 >= 1500 (150% of 1000)

    def test_is_bust(self):
        bm = BankrollManager(initial_bankroll=10, min_bet=5)
        bm.debit(8)
        assert bm.is_bust is True  # balance 2 < min_bet 5

    def test_max_drawdown(self):
        bm = BankrollManager(initial_bankroll=1000)
        bm.credit(500)
        bm.record_snapshot()  # peak = 1500
        bm.debit(750)
        bm.record_snapshot()  # trough = 750
        assert bm.max_drawdown() == 50.0
