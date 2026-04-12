# 用户中心 / 设置页完善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 `superpowers:executing-plans`（或 `subagent-driven-development`）按任务顺序实现；每完成一项勾选 `- [ ]` → `- [x]`。  
> 本计划由 **writing-plans** 产出，供 **executing-plans** 加载执行。

**Goal:** 将「设置」页升级为可用的 **用户中心**：首屏信息克制、与仪表盘/模板页视觉一致；在 **当前无独立 User 表、认证为演示账号** 的前提下，优先落地 **可立即使用的本地/只读能力**，并为后续 **服务端资料与头像存储** 预留接口边界。

**Architecture:**  
- **一期（推荐先做）**：Web 为主——压缩页眉与分区文案；调用已有 `GET /auth/me` 同步服务端身份；**展示昵称**用 **localStorage**（`displayName`）持久化，不与 JWT 冲突；**头像**仅 **首字母/字符圆形徽章**（不上传、不引第三方 Gravatar，避免隐私与网络依赖）。**通知偏好**、**界面偏好**用 localStorage + 可复用的 `useUserPreferences` composable（或 `stores/user-preferences.ts`），与通知中心页约定同一 key 前缀。  
- **二期（可选）**：Prisma `User`（或 `UserProfile`）+ `PATCH /users/me`；头像对象存储后再做上传与裁剪。

**Tech Stack:** Vue 3 + TypeScript、`apps/web-user`、Vitest、Fastify JWT、`apps/api` 现有 `auth` 模块。

**产品决策（执行前已拍板，避免返工）：**

| 能力 | 一期建议 | 理由 |
|------|----------|------|
| **姓名 / 昵称** | **要**：可选「显示名称」，默认用邮箱 `@` 前缀，可编辑后存 localStorage | 模板作者名、问候语、侧栏展示都更友好；服务端未就绪时不伪造后端字段 |
| **头像** | **不要独立头像功能（不上传、不选图）**；仅用 **首字徽章**（来自显示名或邮箱） | 与当前架构一致、零存储成本；用户若强烈要图再开二期 |
| **邮箱** | **只读**，来自 `authState` + 可选 `/auth/me` 校验 | 安全敏感，改邮箱应走专门流程 |
| **通知偏好** | **要（客户端开关）**：如「计划截止提醒」「模板互动」等占位项，默认全开或跟随简单开关 | 为通知中心与后续推送打勾；未接后端前仅本地生效 |
| **主题 / 外观** | **视全站能力**：若尚无 dark CSS 变量体系，仅做 **「跟随系统」** 占位或文档中 **Defer**；勿半套 dark | 避免半吊子主题债 |
| **安全** | **忘记密码**链到已有 `/auth/forgot-password`；**修改密码**在后端无 API 时显示「演示环境说明」或禁用+说明 | 与 `auth.service` 演示用户一致 |
| **会员 / 退出** | 保留现有「模拟专业版」与退出逻辑；文案缩短 | 减少首屏无效说明 |

---

## 文件结构（一期会动到的边界）

| 路径 | 职责 |
|------|------|
| `apps/web-user/src/features/settings/SettingsPage.vue` | 用户中心布局、分区、表单与开关 |
| `apps/web-user/src/lib/api-client.ts`（或同类） | 新增 `getAuthMe({ token })` 调用 `GET /auth/me` |
| `apps/web-user/src/stores/auth.ts` | 可选：`role` 缓存；登录成功后是否拉 me（与现有一致性） |
| `apps/web-user/src/stores/user-preferences.ts`（新建）或 `composables/useUserPreferences.ts` | 通知/外观 key 的读写与类型 |
| `apps/web-user/src/components/UserAvatarBadge.vue`（新建，可选） | 邮箱/昵称 → 圆形首字 |
| `apps/web-user/tests/settings-page.test.ts`（新建） | 挂载设置页、关键 testid、本地偏好写入 |
| `docs/ops/runbook.md` | 若有新环境变量或 API 说明则补一行 |

**不改（一期）：** `apps/api/prisma/schema.prisma`（无二阶段不迁移）。

---

## Tasks

### Task 1: API Client — `GET /auth/me`

**Files:**
- Modify: `apps/web-user/src/lib/api-client.ts`
- Test: 新建或扩展 `apps/web-user/tests/` 下对 client 的 mock 测试（若项目惯例是仅 E2E 页面测，可仅在 Task 5 用 mount + mock fetch）

- [x] **Step 1:** 在 `api-client` 中增加类型与方法，例如：

```ts
export type AuthMeResponse = { userId: string; email: string; role: 'user' | 'admin' };

async function getAuthMe(opts: { token: string }): Promise<AuthMeResponse> {
  const res = await fetch(`${baseURL}/auth/me`, {
    headers: { Authorization: `Bearer ${opts.token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AuthMeResponse>;
}
```

（实现时与现有 `createApiClient` 工厂风格保持一致，导出到同一对象。）

- [x] **Step 2:** 运行 `pnpm --filter @ai-plan/web-user test`，确保无回归。

- [x] **Step 3:** Commit：`feat(web-user): add getAuthMe client`

---

### Task 2: 用户偏好 Store（通知 + 预留外观）

**Files:**
- Create: `apps/web-user/src/stores/user-preferences.ts`

- [x] **Step 1:** 使用 `localStorage` 持久化，键名集中常量，例如：

```ts
const STORAGE_KEY = 'ai-plan-user-prefs-v1';

export type UserPreferences = {
  notifications: {
    planDeadline: boolean;
    templateActivity: boolean;
  };
  /** 预留：'system' | 'light' | 'dark'，一期可仅 'system' */
  theme: 'system';
};

const defaultPreferences: UserPreferences = {
  notifications: { planDeadline: true, templateActivity: true },
  theme: 'system',
};
```

导出 `loadPreferences()`、`savePreferences(partial)` 或 `reactive` store（与 `auth.ts` 风格对齐）。

- [x] **Step 2:** Commit：`feat(web-user): add user preferences store`

---

### Task 3: 首字头像徽章组件（无上传）

**Files:**
- Create: `apps/web-user/src/components/UserAvatarBadge.vue`

- [x] **Step 1:** Props：`label: string`（邮箱或显示名）。取第一个 **Unicode 可见字符** 大写作为文字；容器 `rounded-full bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200`，尺寸 `size-12` 或 `size-14`。

- [x] **Step 2:** 在 `SettingsPage` 顶部「账户信息」区使用该组件，传入 `displayName || userEmail`。

- [x] **Step 3:** Commit：`feat(web-user): add UserAvatarBadge for settings`

---

### Task 4: 设置页 UI 重组与首屏减负

**Files:**
- Modify: `apps/web-user/src/features/settings/SettingsPage.vue`

- [x] **Step 1:** 页眉与 **Dashboard/Archive** 对齐：`h1` 保持 `text-[46px] font-black`；副标题 **一行** 内说清，删除「用户中心即本页」等元描述。

- [x] **Step 2:** 分区建议顺序（卡片均为 `rounded-2xl border border-[#e6ebe8] bg-white p-6 shadow-sm`，危险操作用现有红色区样式）：
  1. **个人资料**：徽章 + 显示名称（`input`，失焦写入 localStorage key `ai-plan-display-name`）+ 只读邮箱 + 只读角色（来自 `getAuthMe` 或 JWT 解析失败时显示「—」）。
  2. **通知**：两个 `switch` 绑定 `user-preferences`。
  3. **安全**：`router-link` 至 `/auth/forgot-password`；小段说明演示环境密码策略。
  4. **会员**：保留现有专业版模拟按钮，说明文字 **两段并一段**。
  5. **退出登录**：保持 `data-testid="settings-logout"`。

- [x] **Step 3:** `onMounted`：若 `authState.token` 存在则 `getAuthMe`，将 `email`/`role` 与本地 `authState` 对齐（可选：仅展示用 ref，不写回 localStorage email 除非与登录流程一致）。

- [x] **Step 4:** 为显示名输入、通知开关补充 `data-testid`（如 `settings-display-name`、`settings-notify-deadline`）便于测试。

- [x] **Step 5:** Commit：`feat(web-user): redesign settings as user center`

---

### Task 5: 测试

**Files:**
- Create: `apps/web-user/tests/settings-page.test.ts`

- [x] **Step 1:** `mount(SettingsPage)`，`global.plugins` 带 `vue-router`（`createMemoryHistory`），mock `getApiClient` 返回 `getAuthMe: vi.fn().mockResolvedValue({ userId: 'u', email: 'a@b.c', role: 'user' })`。

- [x] **Step 2:** 断言：存在 `settings-logout`；点击升级 demo 仍可用（若需 token，按现有测试惯例 `setAuthToken`）。

- [x] **Step 3:** 断言：切换一个通知开关后 `localStorage` 含预期 JSON 片段（或 store 序列化结果）。

- [x] **Step 4:** 运行 `pnpm --filter @ai-plan/web-user test`，全绿。

- [x] **Step 5:** Commit：`test(web-user): settings page user center`

---

### Task 6: 文档与交接

**Files:**
- Modify: `docs/ops/runbook.md`（可选）

- [x] **Step 1:** 若 runbook 有「前端功能列表」，增加一句：设置页显示名与通知偏好仅存浏览器；`/auth/me` 用于展示角色与邮箱校验。

- [x] **Step 2:** 在本计划文末将 **状态** 更新为「进行中 / 已完成」。

---

## Phase 2（单独计划，勿与一期混做）

**Goal:** 服务端用户资料与真·头像。

- Prisma：`User` 表 `id`, `email`, `passwordHash`, `displayName`, `avatarUrl`, `createdAt`…（与现有 JWT `sub` 对齐迁移策略需单独设计）。
- `PATCH /users/me`：`displayName` 校验长度与字符集；`avatar` 先 presigned URL 或内部上传接口。
- Web：登录后拉取 profile；localStorage 显示名作为 **offline fallback** 或废弃。

---

## Self-review（计划自检）

1. **Spec coverage：** 姓名（显示名）、头像（首字徽章）、通知、安全、风格统一、首屏减负 —— 均已映射到 Task 2–4。  
2. **Placeholder scan：** 无 TBD 步骤；主题仅 `system` 占位，不实现半套 dark。  
3. **Type consistency：** `AuthMeResponse.role` 与 Fastify JWT 载荷一致。

---

**状态：** 已完成（2026-04-12）。

**执行方式（给负责人）：**  
计划已保存至 `docs/superpowers/plans/2026-04-11-user-center-settings-page.md`。  

1. **Subagent-Driven（推荐）** — 每任务独立子代理 + 任务间审查。  
2. **Inline** — 本会话用 **executing-plans** 逐项执行并做检查点。

请选择其一后开干。
