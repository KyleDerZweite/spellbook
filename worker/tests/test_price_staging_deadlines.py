import json
import sqlite3
import time

import pytest

from worker.optional_prices import CardmarketAdapter

pytestmark = pytest.mark.usefixtures("price_evaluation_clock")


def test_cardmarket_staged_sort_stops_before_first_row_at_original_deadline(tmp_path):
    products, guide = tmp_path / "products.json", tmp_path / "guide.json"
    products.write_text(
        json.dumps({"version": 1, "createdAt": "2026-10-06T00:00:00Z", "products": []})
    )
    guide.write_text(
        json.dumps({"version": 1, "createdAt": "2026-10-07T00:00:00Z", "priceGuides": []})
    )
    with CardmarketAdapter(products, guide, tmp_path / "stage.sqlite") as adapter:
        adapter.db.executemany(
            "INSERT INTO products VALUES (?)", ((str(i),) for i in range(100000))
        )
        adapter.db.executemany(
            "INSERT INTO points VALUES (?,'nonfoil','trend','1','1')",
            ((str(i),) for i in range(100000)),
        )
        adapter.db.commit()
        adapter.import_deadline = time.monotonic() + 0.005
        started = time.monotonic()
        with pytest.raises(sqlite3.OperationalError, match="interrupted"):
            next(adapter.current_points())
        assert time.monotonic() - started < 0.3


@pytest.mark.parametrize("kind", ["current", "history"])
def test_mtgjson_ambiguous_join_stops_inside_sqlite_at_publication_deadline(tmp_path, kind):
    from uuid import UUID

    from worker.optional_prices import MTGJSONAdapter

    meta = {"date": "2026-10-06", "version": "5.3.0+20261006"}
    printing = "46ca0b66-a000-4483-b916-f5b89e710244"
    ids = [str(UUID(int=i + 1)) for i in range(5000)]
    inputs = {
        "identifiers": {
            key: {"uuid": key, "identifiers": {"scryfallId": printing}} for key in ids
        },
        "today": {
            key: {
                "paper": {
                    "cardmarket": {"currency": "EUR", "retail": {"normal": {"2026-10-06": 1}}}
                }
            }
            for key in ids
        },
        "history": {
            key: {
                "paper": {
                    "cardmarket": {"currency": "EUR", "retail": {"normal": {"2026-10-06": 1}}}
                }
            }
            for key in ids
        },
    }
    for name, data in inputs.items():
        (tmp_path / name).write_text(json.dumps({"meta": meta, "data": data}))
    with MTGJSONAdapter(
        tmp_path / "identifiers",
        tmp_path / "today",
        tmp_path / "history",
        tmp_path / "stage.sqlite",
    ) as adapter:
        started = time.monotonic()
        deadline = started + 0.005
        points = adapter.current_points if kind == "current" else adapter.history_points
        with pytest.raises(sqlite3.OperationalError, match="interrupted"):
            next(points(deadline=deadline))
        assert time.monotonic() - started < 0.3
        assert adapter.import_deadline > deadline
