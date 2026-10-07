import pytest


@pytest.fixture
def price_evaluation_clock(monkeypatch):
    """One controlled UTC clock for price parsing, publication and history retention."""
    from datetime import UTC, datetime

    from worker import optional_prices, optional_publication, price_history

    class ControlledDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = cls(2026, 10, 7, 12, tzinfo=UTC)
            return value.astimezone(tz) if tz is not None else value.replace(tzinfo=None)

    for module in (optional_prices, optional_publication, price_history):
        monkeypatch.setattr(module, "datetime", ControlledDateTime)
