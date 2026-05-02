import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

let dbUp = false;
let schemaUp = false;
try {
  await prisma.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}

if (dbUp) {
  try {
    // 若本地 DB 未应用最新 migration（缺 deletedAt 列），相关路由会 500；此时跳过用例即可。
    await prisma.plan.findFirst({ select: { deletedAt: true, archivedAt: true } });
    schemaUp = true;
  } catch {
    schemaUp = false;
  }
}

const describeDb = dbUp && schemaUp ? describe : describe.skip;

describeDb("plan soft delete / restore / trash", () => {
  const app = buildApp();
  const goalPrefixes = [
    "soft-delete-",
    "restore-",
    "forbidden-",
    "trash-a-",
    "trash-b-",
  ] as const;

  async function cleanupDemoPlans() {
    await prisma.plan.deleteMany({
      where: {
        userId: "user_demo",
        OR: goalPrefixes.map((p) => ({ goal: { startsWith: p } })),
      },
    });
  }

  beforeAll(async () => {
    await app.ready();
    await cleanupDemoPlans();
  });

  afterAll(async () => {
    await cleanupDemoPlans();
    await app.close();
  });

  async function loginUserToken() {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "demo@ai-plan.dev", password: "Pass1234!" },
    });
    const { token } = JSON.parse(login.body) as { token: string };
    return token;
  }

  async function loginAdminToken() {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@ai-plan.dev", password: "Admin1234!" },
    });
    const { token } = JSON.parse(login.body) as { token: string };
    return token;
  }

  async function createAndConfirmPlan(params: { token: string; goal: string }) {
    const create = await app.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${params.token}` },
      payload: {
        goal: params.goal,
        deadline: "2026-12-31T00:00:00.000Z",
        requirement: "soft delete test",
        type: "general",
      },
    });
    expect(create.statusCode).toBe(201);
    const created = JSON.parse(create.body) as { id: string };

    const confirm = await app.inject({
      method: "POST",
      url: `/plans/${created.id}/confirm`,
      headers: { authorization: `Bearer ${params.token}` },
      payload: { version: 1 },
    });
    expect(confirm.statusCode).toBe(200);

    return created.id;
  }

  it("所有相关路由都必须要求登录（JWT）", async () => {
    const del = await app.inject({ method: "DELETE", url: "/plans/some-id" });
    const restore = await app.inject({
      method: "POST",
      url: "/plans/some-id/restore",
    });
    const trash = await app.inject({ method: "GET", url: "/plans/trash" });
    const archived = await app.inject({ method: "GET", url: "/plans/archive" });
    const arc = await app.inject({
      method: "POST",
      url: "/plans/some-id/archive",
    });
    const unarc = await app.inject({
      method: "POST",
      url: "/plans/some-id/unarchive",
    });

    expect(del.statusCode).toBe(401);
    expect(restore.statusCode).toBe(401);
    expect(trash.statusCode).toBe(401);
    expect(archived.statusCode).toBe(401);
    expect(arc.statusCode).toBe(401);
    expect(unarc.statusCode).toBe(401);
  });

  it("DELETE /plans/:id 软删除后：GET /plans 不应返回；GET /plans/trash 应返回", async () => {
    const token = await loginUserToken();
    const planId = await createAndConfirmPlan({
      token,
      goal: `soft-delete-${Date.now()}`,
    });

    const beforeList = await app.inject({
      method: "GET",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(beforeList.statusCode).toBe(200);
    const beforePlans = JSON.parse(beforeList.body) as { plans: Array<{ id: string }> };
    expect(beforePlans.plans.some((p) => p.id === planId)).toBe(true);

    const del = await app.inject({
      method: "DELETE",
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);
    expect(JSON.parse(del.body)).toEqual({ ok: true });

    const afterList = await app.inject({
      method: "GET",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(afterList.statusCode).toBe(200);
    const afterPlans = JSON.parse(afterList.body) as { plans: Array<{ id: string }> };
    expect(afterPlans.plans.some((p) => p.id === planId)).toBe(false);

    const trash = await app.inject({
      method: "GET",
      url: "/plans/trash",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(trash.statusCode).toBe(200);
    const trashBody = JSON.parse(trash.body) as {
      plans: Array<{ id: string; deletedAt?: string | null }>;
    };
    expect(trashBody.plans.some((p) => p.id === planId)).toBe(true);
    const found = trashBody.plans.find((p) => p.id === planId);
    expect(found?.deletedAt).toBeTypeOf("string");
  });

  it("POST /plans/:id/restore 恢复后：GET /plans 应返回；GET /plans/trash 不应返回", async () => {
    const token = await loginUserToken();
    const planId = await createAndConfirmPlan({
      token,
      goal: `restore-${Date.now()}`,
    });

    const del = await app.inject({
      method: "DELETE",
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);

    const restore = await app.inject({
      method: "POST",
      url: `/plans/${planId}/restore`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(restore.statusCode).toBe(200);
    expect(JSON.parse(restore.body)).toEqual({ ok: true });

    const list = await app.inject({
      method: "GET",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(list.body) as { plans: Array<{ id: string }> };
    expect(body.plans.some((p) => p.id === planId)).toBe(true);

    const trash = await app.inject({
      method: "GET",
      url: "/plans/trash",
      headers: { authorization: `Bearer ${token}` },
    });
    const trashBody = JSON.parse(trash.body) as { plans: Array<{ id: string }> };
    expect(trashBody.plans.some((p) => p.id === planId)).toBe(false);
  });

  it("只能操作自己的 plan：非 owner（admin 也不行）应返回 403", async () => {
    const userToken = await loginUserToken();
    const adminToken = await loginAdminToken();
    const planId = await createAndConfirmPlan({
      token: userToken,
      goal: `forbidden-${Date.now()}`,
    });

    const del = await app.inject({
      method: "DELETE",
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(del.statusCode).toBe(403);

    const restore = await app.inject({
      method: "POST",
      url: `/plans/${planId}/restore`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(restore.statusCode).toBe(403);
  });

  it("GET /plans/trash 仅返回 deletedAt 非空，且按 deletedAt desc", async () => {
    const token = await loginUserToken();
    const p1 = await createAndConfirmPlan({ token, goal: `trash-a-${Date.now()}` });
    await new Promise((r) => setTimeout(r, 15));
    const p2 = await createAndConfirmPlan({ token, goal: `trash-b-${Date.now()}` });

    const d1 = await app.inject({
      method: "DELETE",
      url: `/plans/${p1}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(d1.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 15));
    const d2 = await app.inject({
      method: "DELETE",
      url: `/plans/${p2}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(d2.statusCode).toBe(200);

    const trash = await app.inject({
      method: "GET",
      url: "/plans/trash",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(trash.statusCode).toBe(200);
    const body = JSON.parse(trash.body) as {
      plans: Array<{ id: string; deletedAt: string }>;
    };
    const ids = body.plans.map((p) => p.id);
    expect(ids).toContain(p1);
    expect(ids).toContain(p2);

    const idx1 = ids.indexOf(p1);
    const idx2 = ids.indexOf(p2);
    expect(idx2).toBeLessThan(idx1);
  });
});

