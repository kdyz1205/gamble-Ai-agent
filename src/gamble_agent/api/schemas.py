"""API request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from gamble_agent.domain.models import GameType


class SimulationRequest(BaseModel):
    """Request body for running a simulation."""

    game_type: GameType
    strategy: str = "fixed"
    strategy_params: dict[str, object] = Field(default_factory=dict)
    num_rounds: int = Field(default=1000, ge=1, le=100000)
    initial_bankroll: float = Field(default=10000.0, gt=0)
    min_bet: float = Field(default=1.0, gt=0)
    max_bet: float = Field(default=10000.0, gt=0)
    stop_loss_pct: float = Field(default=0.0, ge=0, le=100)
    take_profit_pct: float = Field(default=0.0, ge=0)
    seed: int | None = None


class SimulationResponse(BaseModel):
    """Response from a simulation run."""

    session_id: str
    game_type: str
    strategy_name: str
    initial_bankroll: float
    final_bankroll: float
    net_profit: float
    roi_pct: float
    total_rounds: int
    wins: int
    losses: int
    pushes: int
    win_rate: float
    total_wagered: float
    peak_bankroll: float
    min_bankroll: float
    max_drawdown_pct: float
    bust_round: int | None
    house_edge_observed: float


class BatchSimulationRequest(BaseModel):
    """Request body for running a batch of simulations."""

    game_type: GameType
    strategy: str = "fixed"
    strategy_params: dict[str, object] = Field(default_factory=dict)
    num_rounds: int = Field(default=1000, ge=1, le=100000)
    num_simulations: int = Field(default=100, ge=1, le=1000)
    initial_bankroll: float = Field(default=10000.0, gt=0)
    min_bet: float = Field(default=1.0, gt=0)
    max_bet: float = Field(default=10000.0, gt=0)
    stop_loss_pct: float = Field(default=0.0, ge=0, le=100)
    take_profit_pct: float = Field(default=0.0, ge=0)
    seed: int | None = None


class BatchSimulationResponse(BaseModel):
    """Response from a batch simulation."""

    strategy_name: str
    game_type: str
    num_simulations: int
    avg_net_profit: float
    avg_win_rate: float
    avg_roi_pct: float
    bust_rate: float


class StrategyInfo(BaseModel):
    """Information about an available strategy."""

    name: str
    description: str


class GameInfo(BaseModel):
    """Information about an available game."""

    name: str
    game_type: str
    house_edge: float
    valid_bet_types: list[str]


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "ok"
    version: str
