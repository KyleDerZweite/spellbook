from unittest.mock import MagicMock, patch

import pytest

from worker.main import (
    background_full_update,
    load_state,
    main,
    save_state,
    seed_initial,
    state_file,
    sync_interval_seconds,
    wait_for_meilisearch,
)


class TestSyncIntervalSeconds:
    """Test conversion of interval strings to seconds."""

    def test_daily(self):
        assert sync_interval_seconds("daily") == 86400

    def test_weekly(self):
        assert sync_interval_seconds("weekly") == 604800

    def test_manual_returns_none(self):
        assert sync_interval_seconds("manual") is None

    def test_unknown_returns_none(self):
        assert sync_interval_seconds("hourly") is None


class TestWaitForMeilisearch:
    """Test MeiliSearch health check retry logic."""

    def test_returns_immediately_when_healthy(self):
        mock_indexer = MagicMock()
        mock_indexer.health_check.return_value = True
        wait_for_meilisearch(mock_indexer, max_retries=5)
        assert mock_indexer.health_check.call_count == 1

    @patch("worker.main.time.sleep")
    def test_retries_on_failure(self, mock_sleep):
        mock_indexer = MagicMock()
        mock_indexer.health_check.side_effect = [False, False, True]
        wait_for_meilisearch(mock_indexer, max_retries=5)
        assert mock_indexer.health_check.call_count == 3
        assert mock_sleep.call_count == 2

    @patch("worker.main.time.sleep")
    @patch("worker.main.sys.exit")
    def test_exits_after_max_retries(self, mock_exit, mock_sleep):
        mock_indexer = MagicMock()
        mock_indexer.health_check.return_value = False
        wait_for_meilisearch(mock_indexer, max_retries=3)
        mock_exit.assert_called_once_with(1)
        assert mock_indexer.health_check.call_count == 3

    @patch("worker.main.time.sleep")
    def test_exponential_backoff(self, mock_sleep):
        mock_indexer = MagicMock()
        mock_indexer.health_check.side_effect = [False, False, False, True]
        wait_for_meilisearch(mock_indexer, max_retries=5)
        delays = [c[0][0] for c in mock_sleep.call_args_list]
        assert delays[0] == 1.0
        assert delays[1] == 2.0
        assert delays[2] == 4.0

    @patch("worker.main.time.sleep")
    def test_backoff_caps_at_30(self, mock_sleep):
        mock_indexer = MagicMock()
        # Fail 10 times then succeed, delay should cap at 30
        mock_indexer.health_check.side_effect = [False] * 10 + [True]
        wait_for_meilisearch(mock_indexer, max_retries=15)
        delays = [c[0][0] for c in mock_sleep.call_args_list]
        assert max(delays) <= 30.0


class TestStateManagement:
    """Test crash-resume state persistence."""

    def test_load_state_returns_empty_when_no_file(self, tmp_path):
        assert load_state(tmp_path) == {}

    def test_save_and_load_roundtrip(self, tmp_path):
        save_state({"defaultCardsUpdatedAt": "2026-03-21T09:00:00+00:00"}, tmp_path)
        loaded = load_state(tmp_path)
        assert loaded["defaultCardsUpdatedAt"] == "2026-03-21T09:00:00+00:00"

    def test_save_creates_parent_dirs(self, tmp_path):
        data_dir = tmp_path / "nested" / "dir"
        save_state({"key": "value"}, data_dir)
        assert state_file(data_dir).exists()

    def test_save_overwrites_existing(self, tmp_path):
        save_state({"version": 1}, tmp_path)
        save_state({"version": 2}, tmp_path)
        loaded = load_state(tmp_path)
        assert loaded["version"] == 2

    def test_state_file_honors_data_dir(self, tmp_path):
        assert state_file(tmp_path) == tmp_path / "state.json"

    def test_seed_initial_saves_state_after_successful_index(self, tmp_path):
        info = MagicMock(updated_at="2026-03-21T09:00:00+00:00")
        scryfall = MagicMock()
        scryfall.get_download_info.return_value = info
        indexer = MagicMock()
        indexer.index_from_file.return_value = 123

        seed_initial(scryfall, indexer, tmp_path)

        state = load_state(tmp_path)
        assert state["defaultCardsUpdatedAt"] == info.updated_at
        assert state["lastIndexedDocumentCount"] == 123
        assert state["lastError"] is None

    def test_failed_seed_does_not_update_scryfall_timestamp(self, tmp_path):
        info = MagicMock(updated_at="2026-03-21T09:00:00+00:00")
        scryfall = MagicMock()
        scryfall.get_download_info.return_value = info
        indexer = MagicMock()
        indexer.index_from_file.side_effect = RuntimeError("index failed")

        with pytest.raises(RuntimeError):
            seed_initial(scryfall, indexer, tmp_path)

        state = load_state(tmp_path)
        assert "defaultCardsUpdatedAt" not in state
        assert state["lastError"] == "index failed"

    def test_background_full_update_saves_all_cards_timestamp(self, tmp_path):
        info = MagicMock(updated_at="2026-03-22T09:00:00+00:00")
        scryfall = MagicMock()
        scryfall.get_download_info.return_value = info
        indexer = MagicMock()
        indexer.index_from_file.return_value = 456

        background_full_update(scryfall, indexer, tmp_path)

        state = load_state(tmp_path)
        assert state["allCardsUpdatedAt"] == info.updated_at


class TestMainPeriodicSyncPassesDataDir:
    """Regression: periodic seed_initial must use config.data_dir, not the default."""

    @patch("worker.main.background_full_update")
    @patch("worker.main.seed_initial")
    @patch("worker.main.time.sleep")
    @patch("worker.main.wait_for_meilisearch")
    @patch("worker.main.MeiliIndexer")
    @patch("worker.main.ScryfallClient")
    @patch("worker.main.load_config")
    def test_periodic_seed_initial_receives_configured_data_dir(
        self,
        mock_load_config,
        mock_scryfall_cls,
        mock_indexer_cls,
        mock_wait,
        mock_sleep,
        mock_seed,
        mock_bg,
        tmp_path,
    ):
        config = MagicMock()
        config.data_dir = tmp_path
        config.sync_interval = "daily"
        config.aggressive_preload = False
        mock_load_config.return_value = config

        indexer = mock_indexer_cls.return_value
        indexer.get_distinct_count.return_value = 100_000

        # Break the while True loop after the first periodic sync.
        mock_sleep.side_effect = [None, KeyboardInterrupt()]

        with pytest.raises(KeyboardInterrupt):
            main()

        # The periodic call must pass config.data_dir, not the default.
        calls = mock_seed.call_args_list
        assert any(
            call.args[2] == tmp_path or call.kwargs.get("data_dir") == tmp_path for call in calls
        ), f"Expected seed_initial called with data_dir={tmp_path}, got {calls}"


class TestMainManualPreloadLifecycle:
    """Regression: manual sync must wait for the preload thread before returning."""

    @patch("worker.main.background_full_update")
    @patch("worker.main.wait_for_meilisearch")
    @patch("worker.main.MeiliIndexer")
    @patch("worker.main.ScryfallClient")
    @patch("worker.main.load_config")
    def test_manual_sync_joins_preload_thread(
        self,
        mock_load_config,
        mock_scryfall_cls,
        mock_indexer_cls,
        mock_wait,
        mock_bg,
        tmp_path,
    ):
        import threading

        config = MagicMock()
        config.data_dir = tmp_path
        config.sync_interval = "manual"
        config.aggressive_preload = True
        mock_load_config.return_value = config

        indexer = mock_indexer_cls.return_value
        indexer.get_distinct_count.return_value = 100_000

        finished = threading.Event()

        def slow_preload(*_args, **_kwargs):
            # Simulate work that must finish before main() returns.
            finished.set()

        mock_bg.side_effect = slow_preload

        main()

        assert finished.is_set(), "main() returned before preload completed"
