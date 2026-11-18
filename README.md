# Spellbook

> **TL;DR**
>
> - Self-hosted, open-source **Magic: The Gathering** inventory and deck builder.
> - Search cards, record the printings you own, build decks, see what you are missing.
> - Try it locally: `podman-compose -f compose.yml up --build -d`, then open
>   `http://localhost:3000`.
> - ⚠️ Unreleased. Any commit may break APIs or stored data.

## What you can do

- **Search** the Scryfall card catalog, with or without an account.
- **Track** the exact printings you own in your Inventory.
- **Build** decks and import or export decklists.
- **Compare** a deck with your Inventory to see owned, alternate and missing cards.
- **Follow** the market value of your Inventory over time.

Terms like Printing, Inventory and Box have exact meanings. See the [glossary](GLOSSARY.md).

## Status

Spellbook is **unreleased**. APIs and stored data may break at any commit, and you may need to reset
or reimport data. Read the [pre-release policy](CONTRIBUTING.md#replacing-interfaces) before you
rely on it.

| Area                      | State                                                                             |
| ------------------------- | --------------------------------------------------------------------------------- |
| Website, API, PostgreSQL  | Working                                                                           |
| Accounts                  | Local username and password                                                       |
| Android app               | In progress, see [Android](android/README.md)                                     |
| Scan (image upload)       | Upload and manual Printing selection kept, UI entry paused                        |
| Card recognition          | Not implemented. Local recognition is the planned direction                       |
| Card sorter (Cardstation) | Design accepted, not implemented, see [integrations](docs/integrations/README.md) |

The [recognition decision](docs/decisions/0023-local-recognition-in-scanner-clients.md) explains how
the planned recognition differs from today's upload and review flow.

## Quick start: run it yourself

You need Podman and podman-compose. No `.env` file or tunnel is needed.

1. Start the stack:

   ```sh
   podman-compose -f compose.yml up --build -d
   ```

2. Open `http://localhost:3000` and register an account.
3. Optional: import the full Scryfall catalog (English and German Printings). The database starts
   empty.

   ```sh
   podman-compose -f compose.yml --profile catalog run --rm worker
   ```

4. Stop the stack. Your data stays.

   ```sh
   podman-compose -f compose.yml down
   ```

Ports, storage and recovery: [Deployment](docs/operations/deployment.md#standalone-self-hosting).

## Develop

| Task                      | Command         |
| ------------------------- | --------------- |
| Start the development app | `pnpm dev`      |
| Stop it and keep its data | `pnpm dev:stop` |

- **Without** a root `.env`: runs a separate local project at `http://localhost:3000`.
- **With** a root `.env`: runs configured Development through its Newt tunnel.
- Development uses normal accounts. It has no Demo seed or reset.

Exact commands and private configuration:
[Development startup](docs/operations/deployment.md#stable-server-site-and-optional-development).
Before a pull request, read [CONTRIBUTING.md](CONTRIBUTING.md).

## Hosted Demo and Production

<details>
<summary>For operators of a hosted instance</summary>

- Use one private root `.env` per checkout, with separate `PROD_*`, `DEMO_*` and `DEV_*` keys from
  `.env.example`.
- `compose.prod.yml` owns hosted Demo, Production and the independent stable connector.
- Start the connector after preparing the external ingress network: `pnpm compose site up`.
- Demo rollout:
  1. Set the full `DEMO_IMAGE_REVISION`.
  2. Build it from a clean checkout: `pnpm compose demo build`.
  3. Start it: `pnpm compose demo up`.
- Rollout uses the selected immutable local images and never rebuilds them.
- The Demo has its own database. Scan images are processed in memory and never stored.
- The Demo seed loads the bundled Catalog only when no active Catalog exists. Later full imports and
  private edits survive restarts.
- Hosted Demo and Production publish no application host port.
- A new Production installation stays stopped until you explicitly activate it.
- The hosted Demo currently follows published images automatically, see
  [Automatic Demo updates](docs/operations/deployment.md#automatic-demo-updates).

Full guide: [Deployment](docs/operations/deployment.md).

</details>

## How it is built

| Part         | Technology                    | Where                                     |
| ------------ | ----------------------------- | ----------------------------------------- |
| Website      | SvelteKit                     | [`frontend/`](frontend)                   |
| API          | Python, FastAPI               | [`backend/api/`](backend/api/README.md)   |
| Domain logic | Python                        | [`backend/core/`](backend/core/README.md) |
| Workers      | Python (Catalog, State, Scan) | [`backend/workers/`](backend/workers)     |
| Android app  | Kotlin, Compose               | [`android/`](android/README.md)           |
| Data         | PostgreSQL                    | [Postgres](docs/architecture/postgres.md) |
| API contract | OpenAPI                       | [`contracts/`](contracts/README.md)       |

## Where to read next

| I want to...                         | Read                                                            |
| ------------------------------------ | --------------------------------------------------------------- |
| Know what Spellbook does exactly     | [Product specification](docs/product/specification.md)          |
| Find any document                    | [Documentation index](docs/README.md)                           |
| Understand a domain term             | [Glossary](GLOSSARY.md)                                         |
| Deploy or operate an instance        | [Deployment](docs/operations/deployment.md)                     |
| Reset a password or recover accounts | [Local authentication](docs/operations/local-auth.md)           |
| Run the checks CI runs               | [Repository verification](docs/operations/github-automation.md) |
| See the selected UI components       | [UI components](docs/reference/ui-libraries.md)                 |
| Contribute                           | [CONTRIBUTING.md](CONTRIBUTING.md)                              |
| Report a vulnerability               | [Security policy](.github/SECURITY.md)                          |

## Credits and license

Card data comes from [Scryfall](https://scryfall.com/). Spellbook is licensed under the
[GNU Affero General Public License v3.0](LICENSE).
