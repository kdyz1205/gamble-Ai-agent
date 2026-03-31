"""Core domain models for the gambling simulation system."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


class GameType(str, Enum):
    """Supported game types."""

    BLACKJACK = "blackjack"
    ROULETTE = "roulette"
    DICE = "dice"
    SLOTS = "slots"


class BetOutcome(str, Enum):
    """Possible outcomes for a bet."""

    WIN = "win"
    LOSE = "lose"
    PUSH = "push"


class Bet(BaseModel):
    """Represents a single bet placed by the agent."""

    id: UUID = Field(default_factory=uuid4)
    amount: float = Field(gt=0, description="Bet amount, must be positive")
    bet_type: str = Field(description="Game-specific bet type (e.g., 'hit', 'red', 'pass')")

    @field_validator("amount")
    @classmethod
    def amount_must_be_finite(cls, v: float) -> float:
        import math

        if not isinstance(v, (int, float)) or math.isnan(v) or math.isinf(v):
            raise ValueError("Bet amount must be a finite number")
        return float(v)


class BetResult(BaseModel):
    """Result of a resolved bet."""

    bet: Bet
    outcome: BetOutcome
    payout: float = Field(ge=0, description="Amount paid out (0 for losses)")
    net: float = Field(description="Net gain/loss from this bet")

    @property
    def is_win(self) -> bool:
        return self.outcome == BetOutcome.WIN


class GameRound(BaseModel):
    """A single round of play in any game."""

    id: UUID = Field(default_factory=uuid4)
    game_type: GameType
    round_number: int = Field(ge=1)
    bets: list[BetResult] = Field(default_factory=list)
    bankroll_before: float = Field(ge=0)
    bankroll_after: float = Field(ge=0)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    details: dict[str, object] = Field(
        default_factory=dict, description="Game-specific round details"
    )

    @property
    def net_result(self) -> float:
        return self.bankroll_after - self.bankroll_before

    @property
    def total_wagered(self) -> float:
        return sum(br.bet.amount for br in self.bets)


class SessionStats(BaseModel):
    """Aggregated statistics for a gambling session."""

    session_id: UUID = Field(default_factory=uuid4)
    game_type: GameType
    strategy_name: str
    initial_bankroll: float
    final_bankroll: float
    total_rounds: int
    wins: int
    losses: int
    pushes: int
    total_wagered: float
    peak_bankroll: float
    min_bankroll: float
    bust_round: int | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def net_profit(self) -> float:
        return self.final_bankroll - self.initial_bankroll

    @property
    def win_rate(self) -> float:
        total = self.wins + self.losses + self.pushes
        return self.wins / total if total > 0 else 0.0

    @property
    def roi(self) -> float:
        return (self.net_profit / self.initial_bankroll) * 100 if self.initial_bankroll > 0 else 0.0

    @property
    def house_edge_observed(self) -> float:
        return (-self.net_profit / self.total_wagered) * 100 if self.total_wagered > 0 else 0.0
