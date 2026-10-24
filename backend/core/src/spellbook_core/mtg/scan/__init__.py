"""Typed Scan application. External adapters and their lifetime belong to API."""

from spellbook_core.mtg.scan.application import Scan as Scan
from spellbook_core.mtg.scan.application import create_scan as create_scan
from spellbook_core.mtg.scan.types import ScanImage as ScanImage
from spellbook_core.mtg.scan.types import ScanStorage as ScanStorage
from spellbook_core.mtg.scan.types import ScanWorker as ScanWorker
from spellbook_core.mtg.scan.validation import ScanError as ScanError
