import { z } from 'zod';

export const planCreateSchema = z.object({
  goal: z.string().min(3),
  deadline: z.string().datetime({ offset: true }),
  requirement: z.string().min(5),
  type: z.enum(['general', 'study', 'work']),
});
