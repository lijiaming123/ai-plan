# Runbook

## Local startup

1. Start PostgreSQL locally.
2. Ensure `DATABASE_URL` points to the local database.
3. Run Prisma migrations from `apps/api`.
4. Start the API and the relevant frontend app.

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

