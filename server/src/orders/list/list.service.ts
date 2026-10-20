import type { Database } from 'better-sqlite3';
import { encodeCursor } from './list.cursor';
import { findOrderPage } from './list.repository';
import type { ListQuery, OrderListItem, OrderPage, OrderRow } from './list.types';

function toListItem(row: OrderRow): OrderListItem {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    status: row.status,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    itemCount: row.item_count,
  };
}

function cursorValue(row: OrderRow, sort: ListQuery['sort']): string | number {
  return sort === 'created_at' ? row.created_at : row.total_cents;
}

export function listOrders(db: Database, query: ListQuery): OrderPage {
  const rows = findOrderPage(db, {
    q: query.q,
    status: query.status,
    sort: query.sort,
    dir: query.dir,
    cursor: query.cursor,
    fetchLimit: query.limit + 1,
  });
  const hasMore = rows.length > query.limit;
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ v: cursorValue(last, query.sort), id: last.id }) : null;
  return { items: pageRows.map(toListItem), nextCursor };
}
