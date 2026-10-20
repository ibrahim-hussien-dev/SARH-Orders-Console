import { z } from 'zod';
import { HttpError } from '../../http/errors';
import type { Cursor, SortColumn } from './list.types';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const createdAtCursorSchema = z
  .object({ v: z.string().regex(ISO_TIMESTAMP_PATTERN), id: z.number().int().positive() })
  .strict();

const totalCentsCursorSchema = z
  .object({ v: z.number().int().nonnegative(), id: z.number().int().positive() })
  .strict();

function invalidCursor(): HttpError {
  return new HttpError(400, 'VALIDATION_ERROR', 'Invalid request.', [
    { field: 'cursor', message: 'Cursor is malformed.' },
  ]);
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify({ v: cursor.v, id: cursor.id })).toString('base64url');
}

export function decodeCursor(raw: string, sort: SortColumn): Cursor {
  if (!BASE64URL_PATTERN.test(raw)) {
    throw invalidCursor();
  }
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  const schema = sort === 'created_at' ? createdAtCursorSchema : totalCentsCursorSchema;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw invalidCursor();
  }
  return { v: parsed.data.v, id: parsed.data.id };
}
