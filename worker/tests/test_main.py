from unittest.mock import MagicMock, patch

import pytest

from worker.config import WorkerConfig
from worker.main import load_state, main, save_state, sync_catalog, wait_for_database
from worker.scryfall import BulkDataInfo


@pytest.fixture
def clients():
    scryfall, publisher = MagicMock(), MagicMock()
    scryfall.get_download_info.return_value = BulkDataInfo(
        "all_cards", "fixture://catalog", "2026-10-03T00:00:00Z", 100
    )
    publisher.is_current.return_value = False
    publisher.publish.return_value = 4
    return scryfall, publisher


def test_database_metadata_controls_skip_even_with_stale_local_state(tmp_path, clients):
    scryfall, publisher = clients
    save_state({"allCardsUpdatedAt": "2026-10-03T00:00:00Z"}, tmp_path)
    sync_catalog(scryfall, publisher, "all_cards", tmp_path)
    scryfall.download_bulk_file.assert_called_once()
    publisher.publish.assert_called_once()
    assert load_state(tmp_path)["lastIndexedDocumentCount"] == 4


def test_current_catalog_skips_download(tmp_path, clients):
    scryfall, publisher = clients
    publisher.is_current.return_value = True
    sync_catalog(scryfall, publisher, "all_cards", tmp_path)
    scryfall.download_bulk_file.assert_not_called()
    publisher.publish.assert_not_called()


def test_failed_download_cannot_publish_or_leak_error_contents(tmp_path, clients):
    scryfall, publisher = clients
    scryfall.download_bulk_file.side_effect = ValueError("credential/private document")
    with pytest.raises(ValueError):
        sync_catalog(scryfall, publisher, "all_cards", tmp_path)
    publisher.publish.assert_not_called()
    publisher.record_failure.assert_called_once()
    assert load_state(tmp_path) == {"source": "all_cards", "lastError": "ValueError"}


def test_publication_failure_is_not_recorded_again_by_sync(tmp_path, clients):
    scryfall, publisher = clients
    failure = ValueError("Invalid public source")

    def failed_publish(*_):
        publisher.record_failure("all_cards", failure)
        raise failure

    publisher.publish.side_effect = failed_publish
    with pytest.raises(ValueError):
        sync_catalog(scryfall, publisher, "all_cards", tmp_path)
    publisher.record_failure.assert_called_once_with("all_cards", failure)


def test_missing_source_fails(tmp_path, clients):
    scryfall, publisher = clients
    scryfall.get_download_info.return_value = None
    with pytest.raises(ValueError, match="source"):
        sync_catalog(scryfall, publisher, "all_cards", tmp_path)
    publisher.publish.assert_not_called()


@patch("worker.main.time.sleep")
def test_readiness_retries_and_fails_without_continuing(sleep):
    publisher = MagicMock()
    publisher.health_check.return_value = False
    with pytest.raises(RuntimeError, match="migrations"):
        wait_for_database(publisher, max_retries=3)
    assert [call.args[0] for call in sleep.call_args_list] == [1, 2]


def test_periodic_sync_never_substitutes_default_cards(tmp_path):
    config = WorkerConfig(
        "postgresql://localhost/test", "all_cards", "daily", "fixture://api", tmp_path
    )
    with (
        patch("worker.main.load_config", return_value=config),
        patch("worker.main.CatalogPublisher"),
        patch("worker.main.OptionalPricePublisher"),
        patch("worker.main.ScryfallClient"),
        patch("worker.main.wait_for_database"),
        patch("worker.main.sync_catalog") as sync,
        patch("worker.main.time.sleep", side_effect=[None, KeyboardInterrupt]),
        pytest.raises(KeyboardInterrupt),
    ):
        main()
    assert len(sync.call_args_list) == 2
    assert all(call.args[2:] == ("all_cards", tmp_path) for call in sync.call_args_list)


def test_manual_failure_exits_unsuccessfully(tmp_path):
    config = WorkerConfig(
        "postgresql://localhost/test", "all_cards", "manual", "fixture://api", tmp_path
    )
    with (
        patch("worker.main.load_config", return_value=config),
        patch("worker.main.CatalogPublisher"),
        patch("worker.main.OptionalPricePublisher"),
        patch("worker.main.ScryfallClient"),
        patch("worker.main.wait_for_database"),
        patch("worker.main.sync_catalog", side_effect=ValueError("private")),
        pytest.raises(SystemExit) as exc,
    ):
        main()
    assert exc.value.code == 1


def test_scryfall_failure_still_attempts_optional_sources_before_manual_exit(tmp_path):
    config = WorkerConfig(
        "postgresql://localhost/test", "all_cards", "manual", "fixture://api", tmp_path, True, True
    )
    with (
        patch("worker.main.load_config", return_value=config),
        patch("worker.main.CatalogPublisher"),
        patch("worker.main.OptionalPricePublisher"),
        patch("worker.main.ScryfallClient"),
        patch("worker.main.wait_for_database"),
        patch("worker.main.sync_catalog", side_effect=ValueError("private")),
        patch("worker.main.sync_optional_sources", return_value=True) as optional,
        pytest.raises(SystemExit) as failure,
    ):
        main()
    assert failure.value.code == 1
    optional.assert_called_once()


def test_combo_failure_keeps_existing_periodic_cadence_and_other_provider_isolation(tmp_path):
    config = WorkerConfig(
        "unused",
        "all_cards",
        "daily",
        "fixture://api",
        tmp_path,
        commander_spellbook_enabled=True,
    )
    with (
        patch("worker.main.load_config", return_value=config),
        patch("worker.main.CatalogPublisher"),
        patch("worker.main.OptionalPricePublisher"),
        patch("worker.main.ComboPublisher"),
        patch("worker.main.ScryfallClient"),
        patch("worker.main.wait_for_database"),
        patch("worker.main.sync_catalog", side_effect=ValueError("public failure")),
        patch("worker.main.sync_optional_sources", return_value=False),
        patch("worker.main.sync_oracle_tags", side_effect=ValueError("public failure")),
        patch("worker.main.sync_combo", return_value=False) as combo,
        patch("worker.main.time.sleep", side_effect=KeyboardInterrupt) as sleep,
        pytest.raises(KeyboardInterrupt),
    ):
        main()
    combo.assert_called_once()
    sleep.assert_called_once_with(86400)
