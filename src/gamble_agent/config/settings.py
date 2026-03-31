"""Application settings with environment-based configuration."""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    app_name: str = "Gamble AI Agent"
    debug: bool = False
    log_level: str = "INFO"

    # Simulation defaults
    default_bankroll: float = 10000.0
    default_num_rounds: int = 1000
    max_num_rounds: int = 100000
    min_bet: float = 1.0
    max_bet: float = 10000.0

    # API settings
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_workers: int = 1

    model_config = {"env_prefix": "GAMBLE_", "env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
