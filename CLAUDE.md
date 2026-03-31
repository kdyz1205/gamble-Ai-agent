# Gamble AI Agent

AI-powered gambling simulation and strategy optimization agent.

## Project Structure

```
src/gamble_agent/
  domain/       - Core models (Bet, BetResult, GameRound, SessionStats) and BankrollManager
  games/        - Game engines (blackjack, roulette, dice, slots) + registry
  strategies/   - Betting strategies (fixed, martingale, anti_martingale, kelly, dalembert, percentage)
  simulation/   - SimulationEngine and batch SimulationRunner
  api/          - FastAPI REST API with routes and schemas
  config/       - Pydantic-based settings
tests/
  unit/         - Unit tests for each module
  integration/  - API integration tests
```

## Commands

- Install: `pip install -e ".[dev]"`
- Run tests: `python -m pytest tests/ -v`
- Run with coverage: `python -m pytest tests/ --cov=gamble_agent`
- Lint: `ruff check src/ tests/`
- Type check: `mypy src/`
- Start server: `python -m gamble_agent`

## API Endpoints

- `GET /api/v1/health` - Health check
- `GET /api/v1/games` - List available games
- `GET /api/v1/strategies` - List available strategies
- `POST /api/v1/simulate` - Run a single simulation
- `POST /api/v1/simulate/batch` - Run batch simulations
- `POST /api/v1/compare` - Compare multiple strategies

## Architecture

- **Domain layer** owns models and bankroll logic (no dependencies on games/strategies)
- **Game engines** are stateless per-round; they accept a Bet and return a BetResult
- **Strategies** maintain state across rounds (e.g., consecutive losses) and recommend bet sizes
- **Simulation engine** orchestrates game + strategy + bankroll for N rounds
- **API layer** is thin — validates input, delegates to simulation runner, formats output
