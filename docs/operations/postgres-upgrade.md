# PostgreSQL 17 to 18 upgrade

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: compose configuration, PostgreSQL tools, disposable migration rehearsal
- Update Triggers: PostgreSQL major versions, database volume layout, ownership or role changes, migration commands
- Related Docs: [Deployment](./deployment.md), [Postgres architecture](../architecture/postgres.md), [Local authentication](./local-auth.md), [Operations](./README.md)

The stack now uses PostgreSQL 18.6 with `postgres18_data` mounted at `/var/lib/postgresql`. The image stores its database at `/var/lib/postgresql/18/docker`. Existing PostgreSQL 17 data stays in `postgres_data`; a new volume does not migrate that data automatically.

Use a logical dump and restore into the empty PostgreSQL 18 database before starting migrations or application writers. Never mount the old 17 data directory as an 18 database. Keep the old volume and a protected dump for rollback. This follows PostgreSQL's [major-version migration requirement](https://www.postgresql.org/support/versioning/) and the official image's [version-specific data layout](https://github.com/docker-library/docs/blob/master/postgres/README.md#pgdata).

## Export the existing database

Use the old deployment configuration and the same compose project name throughout the upgrade. Pause public ingress at the reverse proxy or tunnel until verification completes. Pause all application writers, including external database clients:

```sh
podman-compose stop frontend worker scan-worker
podman ps --format '{{.ID}} {{.Names}} {{.Image}}'
```

Record the observed PostgreSQL 17 container, original data volume, configured database name, and database owner. Replace the example values below with those observations. The dump contains private account data and password hashes; store it in the existing protected backup location.

```sh
SPELLBOOK_PG17_CONTAINER=observed-old-container-id
SPELLBOOK_DB_USER=spellbook
SPELLBOOK_DB_NAME=spellbook
SPELLBOOK_PG_BACKUP=/secure/backup/spellbook-before-pg18.dump
umask 077
podman exec "$SPELLBOOK_PG17_CONTAINER" pg_dump \
  -U "$SPELLBOOK_DB_USER" -d "$SPELLBOOK_DB_NAME" \
  --format=custom --no-owner --no-acl > "$SPELLBOOK_PG_BACKUP"
```

Check the command's exit status and confirm the dump is readable before stopping the source. Record table counts, migration history, and the old volume name in private operator notes. Do not print credential or session data into logs. Preserve custom database roles and grants separately if the deployment has them; this procedure restores objects under the configured application owner and deliberately omits old ownership and ACL commands.

Stop PostgreSQL, then update the application checkout and deployment configuration:

```sh
podman-compose stop postgres
```

Do not run `down -v` or remove `postgres_data`.

## Restore before starting the application

Start only PostgreSQL from the updated configuration. This creates the separate PostgreSQL 18 volume:

```sh
podman-compose up -d postgres
podman ps --format '{{.ID}} {{.Names}} {{.Image}} {{.Status}}'
```

Wait for the new database to become healthy. Set the observed PostgreSQL 18 container ID and restore into its empty configured database:

```sh
SPELLBOOK_PG18_CONTAINER=observed-new-container-id
podman exec -i "$SPELLBOOK_PG18_CONTAINER" pg_restore \
  -U "$SPELLBOOK_DB_USER" -d "$SPELLBOOK_DB_NAME" \
  --exit-on-error --single-transaction --no-owner --no-acl < "$SPELLBOOK_PG_BACKUP"
```

A restore error stops the transaction. Investigate before retrying; do not start the frontend against a partial or empty replacement database. Compare restored table counts and migration history with the source, then run application migrations:

```sh
podman-compose run --build --rm db-migrate
podman-compose up --build -d
```

Verify local login, preserved inventory and decks, account isolation, and scan history before reopening external writers. Existing account IDs, credential hashes, and session records must remain intact. Accounts that still need local enrollment use the separate [credential procedure](./local-auth.md); this database upgrade does not create replacement accounts.

## Verification and rollback

A disposable rehearsal on 2026-10-03 restored 13 application tables and six Drizzle migration records from PostgreSQL 17 to 18. Exact row data, 46 constraints, and 33 indexes matched. The existing scrypt password verified, the session hash remained present, and rerunning application migrations succeeded. Restarting the preserved PostgreSQL 17 volume also reproduced the original data, constraints, indexes, password verification, and session hash. This establishes the tested migration mechanism, not a backup of an operator's production database or a full-catalog migration benchmark.

Before reopening writes, rollback can stop the new stack and restart the old checkout, PostgreSQL 17 image, and untouched original volume. Preserve the compose project name and original volume mapping. After new writes occur on PostgreSQL 18, rollback requires reconciling those changes; restarting the old volume alone would omit them. Keep the dump and old volume until the operator's restore policy permits removal.
