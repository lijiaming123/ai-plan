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
