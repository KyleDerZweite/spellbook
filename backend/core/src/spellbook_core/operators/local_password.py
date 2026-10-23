"""Account recovery against the operator-authorized database, without Demo guards."""

import psycopg

from spellbook_core.auth import normalize_username
from spellbook_core.passwords import hash_password
from spellbook_core.validation import valid_password

from . import OperatorError


def set_local_password(database_url: str, account_id: str, username: str, password: str) -> str:
    username_normalized = normalize_username(username)
    if not database_url or not account_id or not username_normalized:
        raise OperatorError("Invalid local credential input")
    if not valid_password(password):
        raise OperatorError("Password must contain 12 to 128 characters")
    password_hash = hash_password(password)
    try:
        with (
            psycopg.connect(database_url, autocommit=True, connect_timeout=10) as connection,
            connection.transaction(),
        ):
            profile = connection.execute(
                "SELECT account_id FROM user_profiles WHERE account_id=%s FOR UPDATE",
                (account_id,),
            ).fetchone()
            if profile is None:
                raise OperatorError("Account does not exist")
            connection.execute(
                """INSERT INTO local_credentials(account_id,username,password_hash)
                   VALUES(%s,%s,%s) ON CONFLICT(account_id) DO UPDATE SET
                   username=EXCLUDED.username,password_hash=EXCLUDED.password_hash,
                   updated_at=now()""",
                (account_id, username_normalized, password_hash),
            )
            connection.execute(
                "UPDATE user_profiles SET username=%s WHERE account_id=%s",
                (username_normalized, account_id),
            )
            connection.execute("DELETE FROM auth_sessions WHERE account_id=%s", (account_id,))
    except OperatorError:
        raise
    except psycopg.Error, ValueError:
        raise OperatorError("Local credential update failed; transaction rolled back.") from None
    return "Local credentials saved. Existing sessions revoked."
