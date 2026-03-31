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
    StrategyCompareRequest,
    StrategyCompareResponse,
    StrategyCompareResult,
    StrategyInfo,
)
from gamble_agent.domain.bankroll import BankrollManager
from gamble_agent.domain.models import GameType
from gamble_agent.games.registry import get_all_engines, get_default_bet_type, get_engine_class
from gamble_agent.simulation.engine import SimulationEngine
from gamble_agent.simulation.runner import SimulationConfig, SimulationRunner
from gamble_agent.strategies.registry import StrategyRegistry

router = APIRouter()


def _resolve_strategy_params(
    game_type: GameType, params: dict[str, object]
) -> dict[str, object]:
    """Inject the correct bet_type for the game if not specified."""
    resolved = dict(params)
    if "bet_type" not in resolved:
        resolved["bet_type"] = get_default_bet_type(game_type)
    return resolved


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(version=__version__)


@router.get("/games", response_model=list[GameInfo])
def list_games() -> list[GameInfo]:
    result = []
    for game_type, engine_cls in get_all_engines().items():
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
        "dalembert": "Increase bet by one unit after loss, decrease after win",
        "percentage": "Bet a fixed percentage of current bankroll",
    }
    return [
        StrategyInfo(name=name, description=descriptions.get(name, ""))
        for name in StrategyRegistry.available()
    ]


@router.post("/simulate", response_model=SimulationResponse)
def run_simulation(request: SimulationRequest) -> SimulationResponse:
    try:
        params = _resolve_strategy_params(request.game_type, request.strategy_params)
        strategy = StrategyRegistry.get(request.strategy, **params)
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid strategy config: {e}")

    rng = random.Random(request.seed)
    game = get_engine_class(request.game_type)(rng=rng)
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
        params = _resolve_strategy_params(request.game_type, request.strategy_params)
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


@router.post("/compare", response_model=StrategyCompareResponse)
def compare_strategies(request: StrategyCompareRequest) -> StrategyCompareResponse:
    if len(request.strategies) < 2:
        raise HTTPException(status_code=400, detail="At least 2 strategies required for comparison")

    runner = SimulationRunner()
    compare_results: list[StrategyCompareResult] = []

    for strat_config in request.strategies:
        name = str(strat_config.get("name", "fixed"))
        params = dict(strat_config.get("params", {}) or {})

        try:
            resolved = _resolve_strategy_params(request.game_type, params)
            strategy = StrategyRegistry.get(name, **resolved)
        except (ValueError, TypeError) as e:
            raise HTTPException(
                status_code=400, detail=f"Invalid strategy '{name}': {e}"
            )

        config = SimulationConfig(
            game_type=request.game_type,
            num_rounds=request.num_rounds,
            initial_bankroll=request.initial_bankroll,
            min_bet=request.min_bet,
            max_bet=request.max_bet,
            seed=request.seed,
        )

        batch = runner.run_batch(config, strategy, request.num_simulations)
        compare_results.append(
            StrategyCompareResult(
                strategy_name=name,
                avg_net_profit=round(batch.avg_net_profit, 2),
                avg_roi_pct=round(batch.avg_roi, 2),
                avg_win_rate=round(batch.avg_win_rate, 4),
                bust_rate=round(batch.bust_rate, 4),
            )
        )

    best = max(compare_results, key=lambda r: r.avg_net_profit)

    return StrategyCompareResponse(
        game_type=request.game_type.value,
        num_simulations=request.num_simulations,
        results=compare_results,
        best_strategy=best.strategy_name,
    )
