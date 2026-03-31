"""Shared test fixtures."""

import random

import pytest
from fastapi.testclient import TestClient

from gamble_agent.api.app import create_app
from gamble_agent.domain.bankroll import BankrollManager
from gamble_agent.domain.models import Bet, BetOutcome, BetResult


@pytest.fixture
def client():
    """FastAPI test client."""
    app = create_app()
    return TestClient(app)


@pytest.fixture
def bankroll():
    """Standard bankroll for testing."""
    return BankrollManager(initial_bankroll=10000, min_bet=1, max_bet=1000)


@pytest.fixture
def seeded_rng():
    """Deterministic RNG for reproducible tests."""
    return random.Random(42)


def make_bet_result(
    outcome: BetOutcome, amount: float = 10.0, bet_type: str = "standard"
) -> BetResult:
    """Helper to create BetResult for tests."""
    bet = Bet(amount=amount, bet_type=bet_type)
    if outcome == BetOutcome.WIN:
        payout = amount * 2
    elif outcome == BetOutcome.PUSH:
        payout = amount
    else:
        payout = 0.0
    return BetResult(bet=bet, outcome=outcome, payout=payout, net=payout - amount)
