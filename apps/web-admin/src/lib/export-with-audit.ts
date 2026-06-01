import { downloadCsv, type CsvColumn } from './csv-export';
import { getAdminApiClient } from './api-client';

export async function exportCsvWithAudit(
  token: string,
  input: {
    filename: string;
    columns: CsvColumn[];
    rows: Record<string, unknown>[];
    action: 'analytics.export' | 'audit.export';
    summary: string;
    meta?: unknown;
  },
) {
  downloadCsv(input.filename, input.columns, input.rows);
  await getAdminApiClient().recordAuditEvent(token, {
    action: input.action,
    summary: input.summary,
    meta: input.meta,
  });
}
