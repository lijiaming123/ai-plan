# Runbook

## Local startup

Use one command from repo root:

`corepack pnpm dev:up`

This script will:

1. Ensure Docker daemon is ready.
2. Start (or create) the `ai-plan-postgres` container.
3. Wait until PostgreSQL becomes ready.
4. Ensure workspace dependencies are installed (auto-install when missing).
5. Apply Prisma migrations for `apps/api`.
6. Pick an API port that can actually bind on the current machine (tries preferred ports, then falls back to an ephemeral port).
7. Start API, user frontend, and admin frontend together.

## Verification

- `pnpm lint`
- `pnpm test`
- `pnpm test:e2e`

## E2E smoke checks

- User flow:
  - login
  - create plan
  - upload submission evidence
  - evaluate the submission
- Admin flow:
  - login as admin
  - view dashboard summary
  - open rules list
  - view submission audit list

## Troubleshooting

- If API tests fail with a Prisma `DATABASE_URL` error, confirm the local Postgres container is running.
- If admin requests return `403`, verify the token was issued for the admin demo account.
- If E2E tests fail because the database is empty, rerun the smoke flow or reset the local database.
