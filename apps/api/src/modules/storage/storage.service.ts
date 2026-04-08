import { createHash } from 'node:crypto';

export function hashUrl(url: string) {
  return createHash('sha256').update(url).digest('hex');
}
