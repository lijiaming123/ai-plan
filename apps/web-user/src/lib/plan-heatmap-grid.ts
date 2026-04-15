/** 概览页热力图：按周列 × 周七行排布，周一为每列首行（与常见贡献图一致） */

export type HeatmapGridStatus = 'completed' | 'missed' | 'pending' | 'none' | 'out';

export type HeatmapGridCell = {
  date: string | null;
  status: HeatmapGridStatus;
  summary?: { due: number; done: number };
};

export type HeatmapDayInput = {
  date: string;
  status: 'completed' | 'missed' | 'pending' | 'none';
  summary?: { due: number; done: number };
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 包含该年 1 月 1 日的那一周的周一（可能落在上一年） */
export function startMondayOfCalendarYear(year: number): Date {
  const jan1 = new Date(year, 0, 1);
  const dow = (jan1.getDay() + 6) % 7;
  const s = new Date(jan1);
  s.setDate(jan1.getDate() - dow);
  return s;
}

/**
 * 生成周列；每列周一至周日共 7 格。不属于本年的格为 `out`。
 */
export function buildYearHeatmapColumns(year: number, days: HeatmapDayInput[]): HeatmapGridCell[][] {
  const map = new Map(days.map((d) => [d.date, d] as const));
  const start = startMondayOfCalendarYear(year);
  const endYmd = `${year}-12-31`;
  const columns: HeatmapGridCell[][] = [];

  for (let c = 0; c < 54; c += 1) {
    const monday = new Date(start);
    monday.setDate(start.getDate() + c * 7);
    if (toYmd(monday) > endYmd) break;

    const col: HeatmapGridCell[] = [];
    for (let r = 0; r < 7; r += 1) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + r);
      const ymd = toYmd(d);
      if (d.getFullYear() !== year) {
        col.push({ date: null, status: 'out' });
        continue;
      }
      if (ymd > endYmd) {
        col.push({ date: null, status: 'out' });
        continue;
      }
      const entry = map.get(ymd);
      col.push({
        date: ymd,
        status: entry?.status ?? 'none',
        summary: entry?.summary,
      });
    }
    columns.push(col);
  }

  return columns;
}

/** 在某周列上方显示的月份标签（该周周一所在月，且仅在该月首次出现时标注） */
export function buildMonthLabelsForColumns(year: number, columns: HeatmapGridCell[][]): string[] {
  const labels: string[] = [];
  let lastMonth = -1;
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  for (const col of columns) {
    const firstInYear = col.find((cell) => cell.date != null);
    if (!firstInYear?.date) {
      labels.push('');
      continue;
    }
    const [y, m] = firstInYear.date.split('-').map(Number);
    const mi = (m ?? 1) - 1;
    if (y === year && mi !== lastMonth) {
      lastMonth = mi;
      labels.push(monthNames[mi] ?? '');
    } else {
      labels.push('');
    }
  }

  return labels;
}
