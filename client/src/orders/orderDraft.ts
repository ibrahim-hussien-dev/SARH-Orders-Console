import { centsToDecimalString } from '../money';
import type { CreateOrderBody } from '../types';

export interface ItemDraft {
  rowId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
}

export interface OrderDraft {
  customerName: string;
  customerEmail: string;
  items: ItemDraft[];
}

let rowCounter = 0;

function nextRowId(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

export function newItemDraft(): ItemDraft {
  return { rowId: nextRowId(), productName: '', quantity: '1', unitPrice: '' };
}

export function emptyDraft(): OrderDraft {
  return { customerName: '', customerEmail: '', items: [newItemDraft()] };
}

export function draftFromBody(body: CreateOrderBody): OrderDraft {
  return {
    customerName: body.customerName,
    customerEmail: body.customerEmail,
    items: body.items.map((item) => ({
      rowId: nextRowId(),
      productName: item.productName,
      quantity: String(item.quantity),
      unitPrice: centsToDecimalString(item.unitPriceCents),
    })),
  };
}
