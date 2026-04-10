# Basic Plan Granularity Design

## 目标
- 普通版创建计划支持 `smart`、`deep`、`rough` 三种颗粒度。
- 生成草稿时统一输出任务时间槽字段：`timeSlotType`、`timeSlotKey`、`taskType`。
- 草稿页允许用户在“未确认前”切换颗粒度并重生成新版本。

## 规则
- `smart`：`D < 30` 推荐 `deep`，`D >= 30` 推荐 `rough`。
- `deep`：
  - `D < 7`：按天任务。
  - `7 <= D < 30`：按天任务 + 周总结。
  - `D >= 30`：按天任务 + 周总结 + 月总结。
- `rough`：
  - `D < 30`：按天任务。
  - `D >= 30`：按周任务。

## 草稿页交互约束
- 仅在草稿未确认阶段允许切换颗粒度。
- 当用户选择与当前版本不同的颗粒度并点击“重新生成”时，先弹二次确认，再调用重生成。
- 计划一旦确认并激活后，不允许回到草稿页。

## 本地测试环境说明
- 运行 API 集成测试前需确保 `DATABASE_URL` 指向本地 PostgreSQL（示例：`postgresql://postgres:postgres@localhost:5432/ai_plan?schema=public`）。
- 若之前执行过 `prisma generate --no-engine`，请改用 `prisma generate` 重新生成本地引擎客户端，否则可能出现 `P6001`（要求 `prisma://`）导致测试返回 500。

