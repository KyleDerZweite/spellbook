# Operations

- Status: Canonical
- Last Reviewed: 2026-11-18
- Source of Truth: mixed
- Update Triggers:
  - Python functional migration verification
  - deployment
  - authentication
  - environment variables
  - repository verification and automation
- Related Docs:
  - [Deployment](./deployment.md)
  - [Local authentication](./local-auth.md)
  - [PostgreSQL upgrade](./postgres-upgrade.md)
  - [Private instance template](./private-instance-template.md)
  - [Repository verification and GitHub automation](./github-automation.md)
  - [Docs index](../README.md)

> **TL;DR**
>
> - How to run, deploy, recover and verify Spellbook.
> - Most readers need [Deployment](./deployment.md) first.
> - Keep live instance values and secrets **outside** this repository.

## Pick a guide

| I want to...                                        | Read                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| Self-host, develop or deploy Demo and Production    | [Deployment](./deployment.md)                                           |
| Set or reset a password, run the Demo account setup | [Local authentication and account recovery](./local-auth.md)            |
| Record my instance's private operator notes         | [Private instance template](./private-instance-template.md)             |
| Run the checks CI runs, understand automation       | [Repository verification and GitHub automation](./github-automation.md) |
| Upgrade the database from PostgreSQL 17 to 18       | [PostgreSQL 17 to 18 upgrade](./postgres-upgrade.md)                    |

## Python backend checks

[Repository verification](./github-automation.md#python-api-and-core) owns the Python functional
checks under the [current migration contract](../architecture/python-backend-migration.md). Strict
P01 resource proof is retired, and production operations remain separate.
