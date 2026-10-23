"""Typed Scan application. External adapters and their lifetime belong to API."""

from .application import Scan as Scan
from .application import create_scan as create_scan
from .types import ScanImage as ScanImage
from .types import ScanStorage as ScanStorage
from .types import ScanWorker as ScanWorker
from .validation import ScanError as ScanError
