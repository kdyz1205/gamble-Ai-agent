"""API request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

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

    @field_validator("max_bet")
    @classmethod
    def max_bet_gte_min_bet(cls, v: float, info: object) -> float:
        data = info.data if hasattr(info, "data") else {}
        min_bet = data.get("min_bet", 1.0)
        if v < min_bet:
            raise ValueError(f"max_bet ({v}) must be >= min_bet ({min_bet})")
        return v


class RoundData(BaseModel):
    """Per-round data for chart rendering."""

    round_number: int
    bankroll_after: float
    bet_amount: float
    outcome: str
    net: float


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
    rounds: list[RoundData] = Field(default_factory=list)


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


class StrategyCompareRequest(BaseModel):
    """Request body for comparing multiple strategies."""

    game_type: GameType
    strategies: list[dict[str, object]] = Field(
        description="List of strategy configs, each with 'name' and optional 'params'"
    )
    num_rounds: int = Field(default=1000, ge=1, le=100000)
    num_simulations: int = Field(default=50, ge=1, le=1000)
    initial_bankroll: float = Field(default=10000.0, gt=0)
    min_bet: float = Field(default=1.0, gt=0)
    max_bet: float = Field(default=10000.0, gt=0)
    seed: int | None = None


class StrategyCompareResult(BaseModel):
    """Result for a single strategy in a comparison."""

    strategy_name: str
    avg_net_profit: float
    avg_roi_pct: float
    avg_win_rate: float
    bust_rate: float


class StrategyCompareResponse(BaseModel):
    """Response from comparing multiple strategies."""

    game_type: str
    num_simulations: int
    results: list[StrategyCompareResult]
    best_strategy: str


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "ok"
    version: str
