import { z } from 'zod';
import { HttpError, fromZod } from '../../http/errors';
import type { NewOrderInput } from './create.types';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const idempotencyKeySchema = z
  .string()
  .regex(UUID_V4_PATTERN)
  .transform((key) => key.toLowerCase());

const orderItemSchema = z.object({
  productName: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(1000),
  unitPriceCents: z.number().int().min(0).max(10000000),
});

const createOrderBodySchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().trim().toLowerCase().max(254).email(),
  items: z.array(orderItemSchema).min(1).max(5),
});

export function parseIdempotencyKey(headerValue: string | undefined): string {
  const result = idempotencyKeySchema.safeParse(headerValue);
  if (!result.success) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'A valid Idempotency-Key header (UUID v4) is required.',
      { header: 'Idempotency-Key' },
    );
  }
  return result.data;
}

export function parseCreateOrderBody(body: unknown): NewOrderInput {
  const result = createOrderBodySchema.safeParse(body);
  if (!result.success) {
    throw fromZod(result.error);
  }
  return result.data;
}
