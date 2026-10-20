import { z } from 'zod';
import { fromZod } from '../../http/errors';
import { decodeCursor } from './list.cursor';
import { ORDER_STATUSES, SORT_COLUMNS, SORT_DIRECTIONS } from './list.types';
import type { ListQuery } from './list.types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_QUERY_LENGTH = 100;
const MAX_CURSOR_LENGTH = 300;
const MAX_DELAY_MS = 3000;

function emptyToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value;
}

const smallInteger = z
  .string()
  .regex(/^\d{1,4}$/, 'Must be a non-negative integer.')
  .transform(Number);

const listQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(MAX_QUERY_LENGTH)
    .optional()
    .transform((value) => (value ? value.toLowerCase() : undefined)),
  status: z.preprocess(emptyToUndefined, z.enum(ORDER_STATUSES).optional()),
  sort: z.enum(SORT_COLUMNS).default('created_at'),
  dir: z.enum(SORT_DIRECTIONS).default('desc'),
  cursor: z.preprocess(emptyToUndefined, z.string().max(MAX_CURSOR_LENGTH).optional()),
  limit: smallInteger.pipe(z.number().int().min(1).max(MAX_LIMIT)).optional(),
  _delayMs: smallInteger.pipe(z.number().int().min(0).max(MAX_DELAY_MS)).optional(),
});

export function parseListQuery(query: Record<string, unknown>, delayEnabled: boolean): ListQuery {
  const input: Record<string, unknown> = { ...query };
  if (!delayEnabled) {
    delete input['_delayMs'];
  }
  const parsed = listQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw fromZod(parsed.error);
  }
  const data = parsed.data;
  return {
    q: data.q,
    status: data.status,
    sort: data.sort,
    dir: data.dir,
    cursor: data.cursor === undefined ? undefined : decodeCursor(data.cursor, data.sort),
    limit: data.limit ?? DEFAULT_LIMIT,
    delayMs: data._delayMs,
  };
}
