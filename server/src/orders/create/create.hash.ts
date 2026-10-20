import { createHash } from 'node:crypto';
import type { NewOrderInput } from './create.types';

export function hashRequest(input: NewOrderInput): string {
  const canonical = {
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    items: input.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
