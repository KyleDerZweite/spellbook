"""ICU en-US ordering used by Node's localeCompare for stable Combo witnesses.

The provider accepts opaque Unicode variant IDs. Code-point ordering disagrees
on punctuation, case and accents, so the ordinary system ICU library is needed
for those IDs. The adapter reads native sort keys without changing process locale.
"""

import atexit
import ctypes
import ctypes.util
import re
import sys
from collections.abc import Callable
from functools import cache


@cache
def _sorter() -> Callable[[str], bytes]:
    library = ctypes.util.find_library("icui18n")
    if library is None:
        raise RuntimeError("Combo Unicode witness ordering requires the system ICU library")
    icu = ctypes.CDLL(library)
    version = re.search(r"(?:\.so\.|\.)([0-9]+)(?:\.|$)", library)
    suffix = "_" + version[1] if version else ""

    def symbol(name: str) -> ctypes._CFuncPtr:  # type: ignore[name-defined]
        return getattr(icu, name + suffix)

    open_collator = symbol("ucol_open")
    open_collator.argtypes = [ctypes.c_char_p, ctypes.POINTER(ctypes.c_int32)]
    open_collator.restype = ctypes.c_void_p
    status = ctypes.c_int32(0)
    collator = open_collator(b"en-US", ctypes.byref(status))
    if not collator or status.value > 0:
        raise RuntimeError("Unable to initialize Combo ICU collation")
    close_collator = symbol("ucol_close")
    close_collator.argtypes = [ctypes.c_void_p]
    close_collator.restype = None
    atexit.register(close_collator, collator)
    get_key = symbol("ucol_getSortKey")
    get_key.argtypes = [
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_uint16),
        ctypes.c_int32,
        ctypes.POINTER(ctypes.c_uint8),
        ctypes.c_int32,
    ]
    get_key.restype = ctypes.c_int32

    def key(value: str) -> bytes:
        raw = value.encode(
            "utf-16-le" if sys.byteorder == "little" else "utf-16-be", "surrogatepass"
        )
        text = (ctypes.c_uint16 * (len(raw) // 2)).from_buffer_copy(raw)
        length = get_key(collator, text, len(text), None, 0)
        result = (ctypes.c_uint8 * length)()
        get_key(collator, text, len(text), result, length)
        return bytes(result)

    return key


def locale_sort_key(value: str) -> bytes:
    return _sorter()(value)
