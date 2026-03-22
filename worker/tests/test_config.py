import pytest

from worker.config import WorkerConfig, load_config


class TestLoadConfigDefaults:
    """Test that load_config uses correct defaults when only required vars are set."""

    def test_returns_worker_config(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        cfg = load_config()
        assert isinstance(cfg, WorkerConfig)

    def test_meilisearch_url(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        assert load_config().meilisearch_url == "http://localhost:7700"

    def test_aggressive_preload_default_true(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        assert load_config().aggressive_preload is True

    def test_sync_interval_default_daily(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        assert load_config().sync_interval == "daily"

    def test_languages_default_en(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        assert load_config().languages == ["en"]

    def test_scryfall_url_default(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        assert load_config().scryfall_bulk_url == "https://api.scryfall.com/bulk-data"


class TestLoadConfigCustom:
    """Test that load_config respects custom environment variables."""

    @pytest.fixture(autouse=True)
    def _set_required(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://meili:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "key-123")

    def test_custom_meilisearch_url(self):
        assert load_config().meilisearch_url == "http://meili:7700"

    def test_aggressive_preload_false(self, monkeypatch):
        monkeypatch.setenv("AGGRESSIVE_PRELOAD", "false")
        assert load_config().aggressive_preload is False

    def test_aggressive_preload_case_insensitive(self, monkeypatch):
        monkeypatch.setenv("AGGRESSIVE_PRELOAD", "FALSE")
        assert load_config().aggressive_preload is False

    def test_sync_interval_weekly(self, monkeypatch):
        monkeypatch.setenv("SYNC_INTERVAL", "weekly")
        assert load_config().sync_interval == "weekly"

    def test_languages_multiple(self, monkeypatch):
        monkeypatch.setenv("LANGUAGES", "en,de,ja")
        assert load_config().languages == ["en", "de", "ja"]

    def test_languages_strips_whitespace(self, monkeypatch):
        monkeypatch.setenv("LANGUAGES", " en , de , ja ")
        assert load_config().languages == ["en", "de", "ja"]

    def test_languages_ignores_empty_segments(self, monkeypatch):
        monkeypatch.setenv("LANGUAGES", "en,,de,")
        assert load_config().languages == ["en", "de"]


class TestLoadConfigMissingRequired:
    """Test that load_config raises when required env vars are missing."""

    def test_missing_meili_master_key(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.delenv("MEILI_MASTER_KEY", raising=False)
        with pytest.raises(ValueError, match="MEILI_MASTER_KEY"):
            load_config()

    def test_empty_meili_master_key(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "")
        with pytest.raises(ValueError, match="MEILI_MASTER_KEY"):
            load_config()


class TestWorkerConfigImmutability:
    """Verify the config dataclass is frozen."""

    def test_cannot_mutate(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://localhost:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "test-key")
        cfg = load_config()
        with pytest.raises(AttributeError):
            cfg.meilisearch_url = "http://other:7700"
