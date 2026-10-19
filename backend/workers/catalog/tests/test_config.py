import pytest

from worker.config import load_config


@pytest.fixture(autouse=True)
def environment(monkeypatch):
    for key in (
        "DATABASE_URL",
        "CATALOG_SOURCE",
        "SYNC_INTERVAL",
        "WORKER_DATA_DIR",
        "SCRYFALL_BULK_URL",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/spellbook")


def test_defaults_select_complete_catalog():
    config = load_config()
    assert config.catalog_source == "all_cards"
    assert config.sync_interval == "daily"
    assert config.scryfall_bulk_url == "https://api.scryfall.com/bulk-data"


@pytest.mark.parametrize(
    "key,value", [("DATABASE_URL", ""), ("CATALOG_SOURCE", "rulings"), ("SYNC_INTERVAL", "hourly")]
)
def test_invalid_configuration_fails(monkeypatch, key, value):
    monkeypatch.setenv(key, value)
    with pytest.raises(ValueError, match=key):
        load_config()


def test_explicit_english_snapshot_and_storage(monkeypatch, tmp_path):
    monkeypatch.setenv("CATALOG_SOURCE", "default_cards")
    monkeypatch.setenv("WORKER_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("SYNC_INTERVAL", "manual")
    config = load_config()
    assert config.catalog_source == "default_cards"
    assert config.data_dir == tmp_path
    assert config.sync_interval == "manual"
