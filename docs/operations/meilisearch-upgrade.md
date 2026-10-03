# MeiliSearch catalog upgrade

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: compose configuration, MeiliSearch CLI, upstream migration guide
- Update Triggers: MeiliSearch image changes, dump format compatibility, volume mapping, operator migration steps
- Related Docs: [Deployment](./deployment.md), [MeiliSearch integration](../integrations/meilisearch/README.md), [Worker](../architecture/worker.md), [Operations](./README.md)

Compose now selects MeiliSearch `v1.54.3`. Existing instances using `v1.39.0` must export and import their catalog before starting the new image against persistent data. Keep the old database volume intact and import into a new empty volume. The compose update does not enable `--upgrade-db`.

The new version passed disposable index, search, and worker integration checks. An upgrade of an operator's existing catalog was not performed by those checks. Rehearse the following procedure with a copy of the deployment before applying it to retained data. It follows the upstream [dump migration procedure](https://github.com/meilisearch/documentation/blob/main/resources/migration/updating.mdx#using-a-dump).

## Export with the old version

1. Keep the old MeiliSearch image running. Stop catalog writers and the frontend with `podman-compose stop frontend worker`. Pause any other administrative clients.
2. Using the protected administrative connection, call `GET /version` and record the old version. Record document counts from `GET /indexes/cards_distinct/stats` and `GET /indexes/cards_all/stats`, plus representative searches and settings.
3. Call `POST /dumps` with the existing master key supplied from the secret store. Poll `GET /tasks/{taskUid}` until its status is `succeeded`. Stop if it fails or is canceled. Read `details.dumpUid` from the completed task; the dump filename is `{dumpUid}.dump`.
4. Identify the old MeiliSearch container and its data volume with the commands below. Replace the container ID and backup directory with the observed values. Copy the completed dump, stop MeiliSearch, and export the stopped volume.

```sh
podman ps --format '{{.ID}} {{.Names}} {{.Image}}'
SPELLBOOK_MEILI_CONTAINER=observed-container-id
SPELLBOOK_MEILI_BACKUP=/secure/backup/spellbook-meili-before-1543
umask 077
mkdir -p "$SPELLBOOK_MEILI_BACKUP"
podman cp "$SPELLBOOK_MEILI_CONTAINER:/meili_data/dumps" "$SPELLBOOK_MEILI_BACKUP/dumps"
SPELLBOOK_MEILI_VOLUME=$(podman inspect --format '{{range .Mounts}}{{if eq .Destination "/meili_data"}}{{.Name}}{{end}}{{end}}' "$SPELLBOOK_MEILI_CONTAINER")
podman-compose stop meilisearch
podman volume export --output "$SPELLBOOK_MEILI_BACKUP/data-volume.tar" "$SPELLBOOK_MEILI_VOLUME"
```

The default container stores dumps under `/meili_data/dumps`. If the old deployment changed its dump directory, copy that configured directory instead. Check that the selected dump and volume backup exist and are readable. Record the original volume name and image in private operator notes. Preserve the old image, volume, master-key reference, and backup for rollback. Do not run `down -v`.

## Import into a new volume

Create a new empty volume. Keep the original volume untouched:

```sh
podman volume create spellbook_meili_1543
```

Use the updated repository and a private compose override, `compose.meili-upgrade.yml`. Replace the absolute dump path with the completed dump above. The `:Z` option labels this private bind mount on SELinux hosts.

```yaml
services:
  meilisearch:
    image: docker.io/getmeili/meilisearch:v1.54.3
    command: ["meilisearch", "--import-dump", "/import/catalog.dump"]
    volumes:
      - meili_upgraded:/meili_data
      - /secure/backup/spellbook-meili-before-1543/dumps/DUMP_UID.dump:/import/catalog.dump:ro,Z
volumes:
  meili_upgraded:
    external: true
    name: spellbook_meili_1543
```

Confirm that the merged configuration maps `/meili_data` to the new volume. Keep all existing protected environment settings, including the master key, and start only MeiliSearch:

```sh
podman-compose -f podman-compose.yml -f compose.meili-upgrade.yml up -d --no-deps --force-recreate meilisearch
podman-compose -f podman-compose.yml -f compose.meili-upgrade.yml logs meilisearch
```

Wait for the dump import to complete. `--import-dump` rejects an existing database; do not bypass that check or a missing dump with ignore flags. A failed import may leave partial new data. Preserve the failure details and retry using another empty volume, never the original volume.

Check `GET /health`, `GET /version`, both index counts, index settings, search-key access, representative English and localized searches, and exact-printing lookup. Compare them with the recorded old instance. Import reindexes the catalog and can require substantial time and memory.

After successful validation, remove `command` and the dump bind mount from the override. Retain the new data-volume mapping. Recreate MeiliSearch without the import option, verify restart, then start the frontend and worker using both compose files. Continue using that volume override for every later deployment; omitting it would reconnect the new image to the old volume.

Restarting the frontend clears its cached search key. Confirm account search and a complete worker synchronization before closing the maintenance window. Database migrations and local password enrollment follow their separate [deployment](./deployment.md) and [account recovery](./local-auth.md) procedures.

## Rollback

Stop the new frontend, worker, and MeiliSearch before rollback. Restore the original MeiliSearch image and original volume mapping, omit the import command, and start the old service. Verify the recorded counts and searches before resuming clients. This procedure leaves the original catalog intact, but any new catalog changes after the upgrade must be reconciled separately. Retain the backups until the operator's restore policy permits removal.
