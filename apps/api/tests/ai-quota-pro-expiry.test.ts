import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";
import { resolveEffectivePlanTier } from "../src/modules/billing/ai-quota.service";

describe("resolveEffectivePlanTier 与 proExpiresAt", () => {
  let userId = "";
  let phone = "";

  it("pro 已过期应视为 basic", async () => {
    phone = `16${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0")}`;
    const passwordHash = await bcrypt.hash("x", 6);
    const u = await prisma.user.create({
      data: {
        phone,
        passwordHash,
        planTier: "pro",
        proExpiresAt: new Date("2020-01-01T00:00:00.000Z"),
      },
      select: { id: true },
    });
    userId = u.id;
    const tier = await resolveEffectivePlanTier(userId);
    expect(tier).toBe("basic");
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });
});
