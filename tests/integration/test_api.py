"""Integration tests for the API layer."""

import pytest
from fastapi.testclient import TestClient

from gamble_agent.api.app import create_app


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


class TestHealthEndpoint:
    def test_health(self, client):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data


class TestGamesEndpoint:
    def test_list_games(self, client):
        resp = client.get("/api/v1/games")
        assert resp.status_code == 200
        games = resp.json()
        assert len(games) == 4
        game_types = {g["game_type"] for g in games}
        assert game_types == {"blackjack", "roulette", "dice", "slots"}


class TestStrategiesEndpoint:
    def test_list_strategies(self, client):
        resp = client.get("/api/v1/strategies")
        assert resp.status_code == 200
        strategies = resp.json()
        names = {s["name"] for s in strategies}
        assert "fixed" in names
        assert "martingale" in names
        assert "kelly" in names


class TestSimulateEndpoint:
    def test_basic_simulation(self, client):
        resp = client.post("/api/v1/simulate", json={
            "game_type": "roulette",
            "strategy": "fixed",
            "strategy_params": {"bet_amount": 10, "bet_type": "red"},
            "num_rounds": 100,
            "initial_bankroll": 1000,
            "seed": 42,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_rounds"] == 100
        assert data["initial_bankroll"] == 1000
        assert "net_profit" in data
        assert "win_rate" in data

    def test_blackjack_simulation(self, client):
        resp = client.post("/api/v1/simulate", json={
            "game_type": "blackjack",
            "strategy": "martingale",
            "strategy_params": {"base_bet": 10, "bet_type": "standard"},
            "num_rounds": 50,
            "seed": 1,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["game_type"] == "blackjack"

    def test_dice_simulation(self, client):
        resp = client.post("/api/v1/simulate", json={
            "game_type": "dice",
            "strategy": "fixed",
            "strategy_params": {"bet_amount": 10, "bet_type": "pass"},
            "num_rounds": 50,
            "seed": 1,
        })
        assert resp.status_code == 200

    def test_slots_simulation(self, client):
        resp = client.post("/api/v1/simulate", json={
            "game_type": "slots",
            "strategy": "fixed",
            "strategy_params": {"bet_amount": 10, "bet_type": "spin"},
            "num_rounds": 50,
            "seed": 1,
        })
        assert resp.status_code == 200

    def test_invalid_strategy(self, client):
        resp = client.post("/api/v1/simulate", json={
            "game_type": "roulette",
            "strategy": "nonexistent",
            "num_rounds": 10,
        })
        assert resp.status_code == 400

    def test_deterministic(self, client):
        payload = {
            "game_type": "roulette",
            "strategy": "fixed",
            "strategy_params": {"bet_amount": 10, "bet_type": "red"},
            "num_rounds": 100,
            "seed": 42,
        }
        r1 = client.post("/api/v1/simulate", json=payload).json()
        r2 = client.post("/api/v1/simulate", json=payload).json()
        assert r1["final_bankroll"] == r2["final_bankroll"]
        assert r1["wins"] == r2["wins"]


class TestBatchSimulateEndpoint:
    def test_batch_simulation(self, client):
        resp = client.post("/api/v1/simulate/batch", json={
            "game_type": "roulette",
            "strategy": "fixed",
            "strategy_params": {"bet_amount": 10, "bet_type": "red"},
            "num_rounds": 50,
            "num_simulations": 10,
            "seed": 42,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["num_simulations"] == 10
        assert "avg_net_profit" in data
        assert "bust_rate" in data
