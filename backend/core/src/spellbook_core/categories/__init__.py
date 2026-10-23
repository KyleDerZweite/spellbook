"""Category application and concrete Deck transaction integration helpers."""

from .application import Categories, create_categories
from .common import (
    CategoryConflict,
    CategoryMergeConflict,
    CategoryNotFound,
    CategoryPreviewCapacity,
    CategoryPreviewExpired,
    CategoryUnavailable,
    LibraryConflict,
    category_transaction,
    configure_combo_adapter,
)
from .jobs import queue_whole_deck_evaluation, touch_whole_deck_job
from .merge import require_category_merge_preview
from .persistence import ensure_entry_category_initialization

__all__ = [
    "Categories",
    "CategoryConflict",
    "CategoryMergeConflict",
    "CategoryNotFound",
    "CategoryPreviewCapacity",
    "CategoryPreviewExpired",
    "CategoryUnavailable",
    "LibraryConflict",
    "category_transaction",
    "configure_combo_adapter",
    "create_categories",
    "ensure_entry_category_initialization",
    "queue_whole_deck_evaluation",
    "require_category_merge_preview",
    "touch_whole_deck_job",
]
