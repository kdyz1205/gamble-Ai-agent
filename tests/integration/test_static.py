"""Tests for static file serving and root route."""


class TestStaticServing:
    def test_root_serves_html(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]
        assert "AI Gambling Arena" in resp.text

    def test_api_still_works(self, client):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_simulate_returns_rounds(self, client):
        resp = client.post("/api/v1/simulate", json={
            "game_type": "roulette",
            "strategy": "fixed",
            "strategy_params": {"bet_amount": 10, "bet_type": "red"},
            "num_rounds": 10,
            "initial_bankroll": 1000,
            "seed": 42,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "rounds" in data
        assert len(data["rounds"]) == data["total_rounds"]
        assert "bankroll_after" in data["rounds"][0]
