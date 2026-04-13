/**
 * Prisma seed 入口（`pnpm db:seed` / dev-up 调用）。
 *
 * 从 `prisma/seeds/preset-templates.json` 读取数组，对每条按 slug upsert：
 * 不存在则 create，存在则 update 标题摘要等展示字段并保持 isActive。
 * 不删除库中已有但 JSON 已移除的预设（需手工清理）。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/prisma';

const __dirname = dirname(fileURLToPath(import.meta.url));

type PresetSeed = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  locale?: string;
  sortOrder?: number;
  payload: unknown;
};

async function main() {
  const path = join(__dirname, 'seeds', 'preset-templates.json');
  const presets = JSON.parse(readFileSync(path, 'utf8')) as PresetSeed[];

  for (const p of presets) {
    await prisma.presetTemplate.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        title: p.title,
        summary: p.summary,
        category: p.category,
        tags: p.tags,
        locale: p.locale ?? 'zh-CN',
        payload: p.payload as object,
        sortOrder: p.sortOrder ?? 0,
        isActive: true,
      },
      update: {
        title: p.title,
        summary: p.summary,
        category: p.category,
        tags: p.tags,
        locale: p.locale ?? 'zh-CN',
        payload: p.payload as object,
        sortOrder: p.sortOrder ?? 0,
        isActive: true,
      },
    });
  }

  console.log(`Seeded ${presets.length} preset template(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
