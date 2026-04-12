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
6. Run preset template seed (`pnpm --filter @ai-plan/api db:seed`) so `GET /templates/presets` has data.
7. Pick an API port that can actually bind on the current machine (tries preferred ports, then falls back to an ephemeral port).
8. Start API, user frontend, and admin frontend together.

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

## User center (Settings)

- **设置页**：显示名称与通知偏好仅保存在浏览器 `localStorage`；与后端同步的身份字段来自 `GET /auth/me`（需 Bearer），用于展示邮箱与角色。

## Help & feedback

- **帮助与反馈页**：FAQ 与搜索为纯前端；「通过邮件发送」使用 `mailto:`，可选环境变量 `VITE_SUPPORT_EMAIL`（默认 `support@ai-plan.dev`），见 `apps/web-user/.env.example`。

## Template system

- **我的模板**：`GET /templates/my/market?scope=created|favorited|liked`（需登录），与公开市场相同的筛选分页参数。
- **收藏**：`POST/DELETE /templates/market/:id/favorite`（需登录）。带 Bearer 访问 `GET /templates/market` 时条目含 `favorited`、`likedByMe`。

- After pulling migrations that add `PresetTemplate` / `MarketTemplate` tables, run:

  `pnpm --filter @ai-plan/api exec prisma migrate deploy`

  then:

  `pnpm --filter @ai-plan/api db:seed`

- If `migrate deploy` fails (e.g. drift), reset the local DB or resolve the failed migration before retrying.

## Troubleshooting

- If API tests fail with a Prisma `DATABASE_URL` error, confirm the local Postgres container is running.
- If admin requests return `403`, verify the token was issued for the admin demo account.
- If E2E tests fail because the database is empty, rerun the smoke flow or reset the local database.
