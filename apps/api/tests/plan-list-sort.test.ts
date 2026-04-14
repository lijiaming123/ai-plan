import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { listPlansForUser } from '../src/modules/plans/plan.service';

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    plan: { findMany: vi.fn() },
  },
}));

describe('listPlansForUser sort', () => {
  beforeEach(() => {
    vi.mocked(prisma.plan.findMany).mockResolvedValue([]);
  });

  it('默认按 createdAt 倒序', async () => {
    await listPlansForUser('user_a');
    expect(prisma.plan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_a' },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('deadline_asc 按 deadline 升序', async () => {
    await listPlansForUser('user_b', { sort: 'deadline_asc' });
    expect(prisma.plan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_b' },
        orderBy: { deadline: 'asc' },
      }),
    );
  });
});
