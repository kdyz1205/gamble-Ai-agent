"""API route handlers."""

from __future__ import annotations

import random

from fastapi import APIRouter, HTTPException

from gamble_agent import __version__
from gamble_agent.api.schemas import (
    BatchSimulationRequest,
    BatchSimulationResponse,
    GameInfo,
    HealthResponse,
    SimulationRequest,
    SimulationResponse,
    StrategyInfo,
)
from gamble_agent.domain.bankroll import BankrollManager
from gamble_agent.domain.models import GameType
from gamble_agent.games.blackjack import BlackjackEngine
from gamble_agent.games.dice import DiceEngine
from gamble_agent.games.roulette import RouletteEngine
from gamble_agent.games.slots import SlotsEngine
from gamble_agent.simulation.engine import SimulationEngine
from gamble_agent.simulation.runner import BatchResult, SimulationConfig, SimulationRunner
from gamble_agent.strategies.registry import StrategyRegistry

router = APIRouter()

GAME_ENGINES = {
    GameType.BLACKJACK: BlackjackEngine,
    GameType.ROULETTE: RouletteEngine,
    GameType.DICE: DiceEngine,
    GameType.SLOTS: SlotsEngine,
}

# Default bet types per game for strategies that use "standard"
GAME_DEFAULT_BET_TYPES = {
    GameType.BLACKJACK: "standard",
    GameType.ROULETTE: "red",
    GameType.DICE: "pass",
    GameType.SLOTS: "spin",
}


def _resolve_strategy_params(
    game_type: GameType, strategy_name: str, params: dict[str, object]
) -> dict[str, object]:
    """Inject the correct bet_type for the game if not specified."""
    resolved = dict(params)
    if "bet_type" not in resolved:
        resolved["bet_type"] = GAME_DEFAULT_BET_TYPES.get(game_type, "standard")
    return resolved


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(version=__version__)


@router.get("/games", response_model=list[GameInfo])
def list_games() -> list[GameInfo]:
    result = []
    for game_type, engine_cls in GAME_ENGINES.items():
        engine = engine_cls()
        result.append(
            GameInfo(
                name=game_type.value.title(),
                game_type=game_type.value,
                house_edge=engine.house_edge,
                valid_bet_types=engine.valid_bet_types,
            )
        )
    return result


@router.get("/strategies", response_model=list[StrategyInfo])
def list_strategies() -> list[StrategyInfo]:
    descriptions = {
        "fixed": "Bet a fixed amount every round",
        "martingale": "Double bet after each loss, reset after win",
        "anti_martingale": "Double bet after each win, reset after loss",
        "kelly": "Bet a fraction of bankroll using the Kelly Criterion",
    }
    return [
        StrategyInfo(name=name, description=descriptions.get(name, ""))
        for name in StrategyRegistry.available()
    ]


@router.post("/simulate", response_model=SimulationResponse)
def run_simulation(request: SimulationRequest) -> SimulationResponse:
    try:
        params = _resolve_strategy_params(
            request.game_type, request.strategy, request.strategy_params
        )
        strategy = StrategyRegistry.get(request.strategy, **params)
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid strategy config: {e}")

    rng = random.Random(request.seed)
    game = GAME_ENGINES[request.game_type](rng=rng)
    bankroll = BankrollManager(
        initial_bankroll=request.initial_bankroll,
        min_bet=request.min_bet,
        max_bet=request.max_bet,
        stop_loss_pct=request.stop_loss_pct,
        take_profit_pct=request.take_profit_pct,
    )

    engine = SimulationEngine(game=game, strategy=strategy, bankroll=bankroll)
    stats = engine.run(request.num_rounds)

    return SimulationResponse(
        session_id=str(stats.session_id),
        game_type=stats.game_type.value,
        strategy_name=stats.strategy_name,
        initial_bankroll=stats.initial_bankroll,
        final_bankroll=stats.final_bankroll,
        net_profit=stats.net_profit,
        roi_pct=round(stats.roi, 2),
        total_rounds=stats.total_rounds,
        wins=stats.wins,
        losses=stats.losses,
        pushes=stats.pushes,
        win_rate=round(stats.win_rate, 4),
        total_wagered=stats.total_wagered,
        peak_bankroll=stats.peak_bankroll,
        min_bankroll=stats.min_bankroll,
        max_drawdown_pct=round(bankroll.max_drawdown(), 2),
        bust_round=stats.bust_round,
        house_edge_observed=round(stats.house_edge_observed, 4),
    )


@router.post("/simulate/batch", response_model=BatchSimulationResponse)
def run_batch_simulation(request: BatchSimulationRequest) -> BatchSimulationResponse:
    try:
        params = _resolve_strategy_params(
            request.game_type, request.strategy, request.strategy_params
        )
        strategy = StrategyRegistry.get(request.strategy, **params)
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid strategy config: {e}")

    config = SimulationConfig(
        game_type=request.game_type,
        num_rounds=request.num_rounds,
        initial_bankroll=request.initial_bankroll,
        min_bet=request.min_bet,
        max_bet=request.max_bet,
        stop_loss_pct=request.stop_loss_pct,
        take_profit_pct=request.take_profit_pct,
        seed=request.seed,
    )

    runner = SimulationRunner()
    batch: BatchResult = runner.run_batch(config, strategy, request.num_simulations)

    return BatchSimulationResponse(
        strategy_name=batch.strategy_name,
        game_type=request.game_type.value,
        num_simulations=batch.num_simulations,
        avg_net_profit=round(batch.avg_net_profit, 2),
        avg_win_rate=round(batch.avg_win_rate, 4),
        avg_roi_pct=round(batch.avg_roi, 2),
        bust_rate=round(batch.bust_rate, 4),
    )
