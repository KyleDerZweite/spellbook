"""Construct only discovery today. No database, listener or scheduler is acquired."""

from spellbook_api.http.application import create_http_application
from spellbook_api.http.types import ApplicationLifetime, Configuration


async def _close_discovery() -> None:
    """Discovery owns no external resources or streams."""


def create_application(configuration: Configuration) -> ApplicationLifetime:
    return ApplicationLifetime(
        http=create_http_application(configuration),
        close_streams=_close_discovery,
        close=_close_discovery,
    )
