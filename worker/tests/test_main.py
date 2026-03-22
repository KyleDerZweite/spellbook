from unittest.mock import MagicMock, patch

from worker.main import load_state, save_state, sync_interval_seconds, wait_for_meilisearch


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

    def test_load_state_returns_empty_when_no_file(self, tmp_path, monkeypatch):
        monkeypatch.setattr("worker.main.STATE_FILE", tmp_path / "state.json")
        assert load_state() == {}

    def test_save_and_load_roundtrip(self, tmp_path, monkeypatch):
        state_file = tmp_path / "state.json"
        monkeypatch.setattr("worker.main.STATE_FILE", state_file)
        save_state({"default_cards_updated_at": "2026-03-21T09:00:00+00:00"})
        loaded = load_state()
        assert loaded["default_cards_updated_at"] == "2026-03-21T09:00:00+00:00"

    def test_save_creates_parent_dirs(self, tmp_path, monkeypatch):
        state_file = tmp_path / "nested" / "dir" / "state.json"
        monkeypatch.setattr("worker.main.STATE_FILE", state_file)
        save_state({"key": "value"})
        assert state_file.exists()

    def test_save_overwrites_existing(self, tmp_path, monkeypatch):
        state_file = tmp_path / "state.json"
        monkeypatch.setattr("worker.main.STATE_FILE", state_file)
        save_state({"version": 1})
        save_state({"version": 2})
        loaded = load_state()
        assert loaded["version"] == 2
