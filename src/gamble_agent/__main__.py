"""Entry point for running the application."""

import uvicorn

from gamble_agent.api.app import create_app
from gamble_agent.config.settings import get_settings


def main() -> None:
    settings = get_settings()
    app = create_app()
    uvicorn.run(
        app,
        host=settings.api_host,
        port=settings.api_port,
        workers=settings.api_workers,
    )


if __name__ == "__main__":
    main()
