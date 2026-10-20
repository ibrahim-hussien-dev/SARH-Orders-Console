import { isRecord } from './guards';
import { centsToDecimalString, parseMoneyToCents } from './money';
import type { ItemDraft, OrderDraft } from './orders/orderDraft';
import type { CreateOrderBody, CreateOrderItemBody } from './types';

export const LIMITS = {
  itemsMin: 1,
  itemsMax: 5,
  quantityMin: 1,
  quantityMax: 1000,
  priceMinCents: 0,
  priceMaxCents: 10000000,
  nameMin: 1,
  nameMax: 120,
  emailMax: 254,
  searchMax: 100,
  passwordMax: 128,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QUANTITY_PATTERN = /^\d{1,4}$/;

export interface ItemErrors {
  productName?: string;
  quantity?: string;
  unitPrice?: string;
}

export interface DraftErrors {
  customerName?: string;
  customerEmail?: string;
  itemCount?: string;
  items: ItemErrors[];
}

export interface DraftValidation {
  errors: DraftErrors;
  body: CreateOrderBody | null;
  totalCents: number | null;
}

interface ItemValidation {
  errors: ItemErrors;
  body: CreateOrderItemBody | null;
  lineTotalCents: number | null;
}

export function normalizeName(value: string): string {
  return value.trim();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isLengthInRange(value: string, min: number, max: number): boolean {
  return value.length >= min && value.length <= max;
}

function isValidEmail(value: string): boolean {
  return value.length <= LIMITS.emailMax && EMAIL_PATTERN.test(value);
}

function parseQuantity(text: string): number | null {
  const trimmed = text.trim();
  if (!QUANTITY_PATTERN.test(trimmed)) {
    return null;
  }
  const quantity = Number(trimmed);
  return quantity >= LIMITS.quantityMin && quantity <= LIMITS.quantityMax ? quantity : null;
}

type PriceResult = { cents: number } | { error: string };

function parsePrice(text: string): PriceResult {
  const parsed = parseMoneyToCents(text);
  if (!parsed.ok) {
    switch (parsed.reason) {
      case 'empty':
        return { error: 'Enter a price.' };
      case 'too_many_decimals':
        return { error: 'Use at most 2 decimal places.' };
      case 'too_large':
        return { error: 'Price is too large.' };
      case 'format':
        return { error: 'Use digits and an optional decimal point, for example 19.99.' };
    }
  }
  if (parsed.cents < LIMITS.priceMinCents || parsed.cents > LIMITS.priceMaxCents) {
    return { error: `Price must be at most ${centsToDecimalString(LIMITS.priceMaxCents)}.` };
  }
  return { cents: parsed.cents };
}

function validateItem(item: ItemDraft): ItemValidation {
  const errors: ItemErrors = {};
  const productName = normalizeName(item.productName);
  if (!isLengthInRange(productName, LIMITS.nameMin, LIMITS.nameMax)) {
    errors.productName = `Product name must be ${LIMITS.nameMin} to ${LIMITS.nameMax} characters.`;
  }
  const quantity = parseQuantity(item.quantity);
  if (quantity === null) {
    errors.quantity = `Quantity must be a whole number from ${LIMITS.quantityMin} to ${LIMITS.quantityMax}.`;
  }
  const price = parsePrice(item.unitPrice);
  if ('error' in price) {
    errors.unitPrice = price.error;
  }

  const lineTotalCents = quantity !== null && 'cents' in price ? quantity * price.cents : null;
  const hasErrors = errors.productName !== undefined || errors.quantity !== undefined || errors.unitPrice !== undefined;
  if (hasErrors || quantity === null || 'error' in price) {
    return { errors, body: null, lineTotalCents };
  }
  return {
    errors,
    body: { productName, quantity, unitPriceCents: price.cents },
    lineTotalCents,
  };
}

export function validateDraft(draft: OrderDraft): DraftValidation {
  const results = draft.items.map(validateItem);
  const errors: DraftErrors = { items: results.map((result) => result.errors) };

  const customerName = normalizeName(draft.customerName);
  if (!isLengthInRange(customerName, LIMITS.nameMin, LIMITS.nameMax)) {
    errors.customerName = `Customer name must be ${LIMITS.nameMin} to ${LIMITS.nameMax} characters.`;
  }
  const customerEmail = normalizeEmail(draft.customerEmail);
  if (!isValidEmail(customerEmail)) {
    errors.customerEmail = `Enter a valid email address (at most ${LIMITS.emailMax} characters).`;
  }
  if (draft.items.length < LIMITS.itemsMin || draft.items.length > LIMITS.itemsMax) {
    errors.itemCount = `An order needs ${LIMITS.itemsMin} to ${LIMITS.itemsMax} items.`;
  }

  const items: CreateOrderItemBody[] = [];
  let totalCents: number | null = 0;
  for (const result of results) {
    if (result.body !== null) {
      items.push(result.body);
    }
    totalCents = totalCents === null || result.lineTotalCents === null ? null : totalCents + result.lineTotalCents;
  }

  const valid =
    errors.customerName === undefined &&
    errors.customerEmail === undefined &&
    errors.itemCount === undefined &&
    items.length === results.length;

  return {
    errors,
    body: valid ? { customerName, customerEmail, items } : null,
    totalCents,
  };
}

export function bodySignature(body: CreateOrderBody): string {
  return JSON.stringify({
    customerName: body.customerName,
    customerEmail: body.customerEmail,
    items: body.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
  });
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isNormalizedName(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && isLengthInRange(value, LIMITS.nameMin, LIMITS.nameMax);
}

function isNormalizedEmail(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim().toLowerCase() && isValidEmail(value);
}

function parseNormalizedItem(value: unknown): CreateOrderItemBody | null {
  if (!isRecord(value)) {
    return null;
  }
  const productName = value['productName'];
  const quantity = value['quantity'];
  const unitPriceCents = value['unitPriceCents'];
  if (
    !isNormalizedName(productName) ||
    !isIntegerInRange(quantity, LIMITS.quantityMin, LIMITS.quantityMax) ||
    !isIntegerInRange(unitPriceCents, LIMITS.priceMinCents, LIMITS.priceMaxCents)
  ) {
    return null;
  }
  return { productName, quantity, unitPriceCents };
}

export function parseNormalizedBody(value: unknown): CreateOrderBody | null {
  if (!isRecord(value)) {
    return null;
  }
  const customerName = value['customerName'];
  const customerEmail = value['customerEmail'];
  const rawItems = value['items'];
  if (!isNormalizedName(customerName) || !isNormalizedEmail(customerEmail) || !Array.isArray(rawItems)) {
    return null;
  }
  const candidates: unknown[] = rawItems;
  if (candidates.length < LIMITS.itemsMin || candidates.length > LIMITS.itemsMax) {
    return null;
  }
  const items: CreateOrderItemBody[] = [];
  for (const candidate of candidates) {
    const item = parseNormalizedItem(candidate);
    if (item === null) {
      return null;
    }
    items.push(item);
  }
  return { customerName, customerEmail, items };
}
