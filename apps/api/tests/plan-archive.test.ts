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
    await prisma.plan.findFirst({ select: { deletedAt: true, archivedAt: true } });
    schemaUp = true;
  } catch {
    schemaUp = false;
  }
}

const describeDb = dbUp && schemaUp ? describe : describe.skip;

describeDb("plan archive / unarchive", () => {
  const app = buildApp();
  const goalPrefixes = ["archive-api-", "archive-flow-"] as const;

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

  async function createAndConfirmPlan(params: { token: string; goal: string }) {
    const create = await app.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${params.token}` },
      payload: {
        goal: params.goal,
        deadline: "2026-12-31T00:00:00.000Z",
        requirement: "archive test",
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

  it("归档相关路由未登录应 401", async () => {
    const list = await app.inject({ method: "GET", url: "/plans/archive" });
    const arc = await app.inject({ method: "POST", url: "/plans/x/archive" });
    const un = await app.inject({ method: "POST", url: "/plans/x/unarchive" });
    expect(list.statusCode).toBe(401);
    expect(arc.statusCode).toBe(401);
    expect(un.statusCode).toBe(401);
  });

  it("POST archive 后：GET /plans 不含；GET /plans/archive 含；详情 status 为 archived", async () => {
    const token = await loginUserToken();
    const planId = await createAndConfirmPlan({
      token,
      goal: `archive-flow-${Date.now()}`,
    });

    const arc = await app.inject({
      method: "POST",
      url: `/plans/${planId}/archive`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(arc.statusCode).toBe(200);
    expect(JSON.parse(arc.body)).toEqual({ ok: true });

    const list = await app.inject({
      method: "GET",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
    });
    const listBody = JSON.parse(list.body) as { plans: Array<{ id: string }> };
    expect(listBody.plans.some((p) => p.id === planId)).toBe(false);

    const archived = await app.inject({
      method: "GET",
      url: "/plans/archive",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(archived.statusCode).toBe(200);
    const archBody = JSON.parse(archived.body) as {
      plans: Array<{ id: string; status: string; archivedAt: string }>;
      hasMore: boolean;
    };
    expect(archBody.hasMore).toBe(false);
    const row = archBody.plans.find((p) => p.id === planId);
    expect(row).toBeTruthy();
    expect(row?.status).toBe("archived");
    expect(row?.archivedAt).toBeTypeOf("string");

    const detail = await app.inject({
      method: "GET",
      url: `/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    const d = JSON.parse(detail.body) as { status: string };
    expect(d.status).toBe("archived");
  });

  it("POST unarchive 后回到 GET /plans", async () => {
    const token = await loginUserToken();
    const planId = await createAndConfirmPlan({
      token,
      goal: `archive-api-${Date.now()}`,
    });

    await app.inject({
      method: "POST",
      url: `/plans/${planId}/archive`,
      headers: { authorization: `Bearer ${token}` },
    });

    const un = await app.inject({
      method: "POST",
      url: `/plans/${planId}/unarchive`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(un.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(list.body) as { plans: Array<{ id: string }> };
    expect(body.plans.some((p) => p.id === planId)).toBe(true);
  });

  it("GET /plans/archive 支持 limit/offset/hasMore 与 search", async () => {
    const token = await loginUserToken();
    const isolate = `archive-paginate-${Date.now()}`;
    const idA = await createAndConfirmPlan({
      token,
      goal: `${isolate}-alpha`,
    });
    const idB = await createAndConfirmPlan({
      token,
      goal: `${isolate}-beta`,
    });

    for (const id of [idA, idB]) {
      const arc = await app.inject({
        method: "POST",
        url: `/plans/${id}/archive`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(arc.statusCode).toBe(200);
    }

    const q = encodeURIComponent(isolate);
    const page0 = await app.inject({
      method: "GET",
      url: `/plans/archive?limit=1&offset=0&sort=created&search=${q}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(page0.statusCode).toBe(200);
    const body0 = JSON.parse(page0.body) as {
      plans: Array<{ id: string }>;
      hasMore: boolean;
    };
    expect(body0.plans).toHaveLength(1);
    expect(body0.hasMore).toBe(true);

    const page1 = await app.inject({
      method: "GET",
      url: `/plans/archive?limit=1&offset=1&sort=created&search=${q}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(page1.statusCode).toBe(200);
    const body1 = JSON.parse(page1.body) as {
      plans: Array<{ id: string }>;
      hasMore: boolean;
    };
    expect(body1.plans).toHaveLength(1);
    expect(body1.hasMore).toBe(false);
    expect(body1.plans[0].id).not.toBe(body0.plans[0].id);

    const badLimit = await app.inject({
      method: "GET",
      url: "/plans/archive?limit=99",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(badLimit.statusCode).toBe(400);

    const search = await app.inject({
      method: "GET",
      url: `/plans/archive?search=${encodeURIComponent(`${isolate}-alpha`)}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(search.statusCode).toBe(200);
    const searchBody = JSON.parse(search.body) as { plans: Array<{ id: string }> };
    expect(searchBody.plans.some((p) => p.id === idA)).toBe(true);
    expect(searchBody.plans.some((p) => p.id === idB)).toBe(false);
  });
});
