"""Run with ACCOUNT_ID USERNAME and a password on bounded standard input."""

import os
import re
import sys
from collections.abc import Sequence
from typing import BinaryIO

from spellbook_core.auth import normalize_username
from spellbook_core.operators import OperatorError
from spellbook_core.operators.local_password import set_local_password
from spellbook_core.validation import utf16_length, valid_password

from .common import Parser


def read_password(stream: BinaryIO) -> str:
    # 130 UTF-16 units can require at most 390 UTF-8 bytes. Read a bounded
    # sentinel beyond that limit, including the optional trailing CRLF.
    raw = stream.read(391)
    password = raw.decode("utf-8", errors="replace")
    if len(raw) > 390 or utf16_length(password) > 130:
        raise OperatorError("Password is too long")
    password = re.sub(r"\r?\n$", "", password)
    if not valid_password(password):
        raise OperatorError("Password must contain 12 to 128 characters")
    return password


def main(argv: Sequence[str] | None = None) -> int:
    parser = Parser(description="Set local credentials and revoke the account's sessions.")
    parser.add_argument("account_id")
    parser.add_argument("username")
    args = parser.parse_args(argv)
    url = os.environ.get("DATABASE_URL")
    if not url or not args.account_id or not normalize_username(args.username):
        print(
            "Valid account, username and DATABASE_URL environment are required.", file=sys.stderr
        )
        return 2
    try:
        password = read_password(sys.stdin.buffer)
        message = set_local_password(url, args.account_id, args.username, password)
    except OperatorError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except OSError, ValueError:
        print("Local credential input could not be read.", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Local credential update interrupted.", file=sys.stderr)
        return 130
    print(message)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
