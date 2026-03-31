"""Strategy registry for dynamic strategy lookup."""

from __future__ import annotations

from typing import ClassVar

from gamble_agent.strategies.anti_martingale import AntiMartingaleStrategy
from gamble_agent.strategies.base import BettingStrategy
from gamble_agent.strategies.dalembert import DAlembertStrategy
from gamble_agent.strategies.fixed import FixedBetStrategy
from gamble_agent.strategies.kelly import KellyCriterionStrategy
from gamble_agent.strategies.martingale import MartingaleStrategy
from gamble_agent.strategies.percentage import PercentageBetStrategy


class StrategyRegistry:
    """Registry mapping strategy names to factory functions."""

    _strategies: ClassVar[dict[str, type[BettingStrategy]]] = {
        "fixed": FixedBetStrategy,
        "martingale": MartingaleStrategy,
        "anti_martingale": AntiMartingaleStrategy,
        "kelly": KellyCriterionStrategy,
        "dalembert": DAlembertStrategy,
        "percentage": PercentageBetStrategy,
    }

    @classmethod
    def get(cls, name: str, **kwargs: object) -> BettingStrategy:
        """Create a strategy by name with optional configuration."""
        if name not in cls._strategies:
            raise ValueError(
                f"Unknown strategy '{name}'. Available: {list(cls._strategies.keys())}"
            )
        return cls._strategies[name](**kwargs)

    @classmethod
    def available(cls) -> list[str]:
        """List all registered strategy names."""
        return list(cls._strategies.keys())

    @classmethod
    def register(cls, name: str, strategy_cls: type[BettingStrategy]) -> None:
        """Register a new strategy type."""
        cls._strategies[name] = strategy_cls


def get_strategy(name: str, **kwargs: object) -> BettingStrategy:
    """Convenience function for getting strategies from the registry."""
    return StrategyRegistry.get(name, **kwargs)
