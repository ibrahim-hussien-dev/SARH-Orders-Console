import type { Database } from 'better-sqlite3';
import type { Cursor, OrderRow, OrderStatus, SortColumn, SortDirection } from './list.types';

export interface PageFilters {
  q: string | undefined;
  status: OrderStatus | undefined;
  sort: SortColumn;
  dir: SortDirection;
  cursor: Cursor | undefined;
  fetchLimit: number;
}

export interface PageQuery {
  sql: string;
  args: Array<string | number>;
}

const SORT_SQL: Record<SortColumn, string> = {
  created_at: 'o.created_at',
  total_cents: 'o.total_cents',
};

const DIRECTION_SQL: Record<SortDirection, string> = { asc: 'ASC', desc: 'DESC' };

const AFTER_CURSOR_SQL: Record<SortDirection, string> = { asc: '>', desc: '<' };

const ESCAPE_CLAUSE = "ESCAPE '\\'";

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function buildPageQuery(filters: PageFilters): PageQuery {
  const conditions: string[] = [];
  const args: Array<string | number> = [];

  if (filters.status !== undefined) {
    conditions.push('o.status = ?');
    args.push(filters.status);
  }
  if (filters.q !== undefined) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(
      `(o.customer_name_lc LIKE ? ${ESCAPE_CLAUSE} OR o.customer_email_lc LIKE ? ${ESCAPE_CLAUSE})`,
    );
    args.push(pattern, pattern);
  }

  const column = SORT_SQL[filters.sort];
  const direction = DIRECTION_SQL[filters.dir];

  if (filters.cursor !== undefined) {
    conditions.push(`(${column}, o.id) ${AFTER_CURSOR_SQL[filters.dir]} (?, ?)`);
    args.push(filters.cursor.v, filters.cursor.id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  args.push(filters.fetchLimit);

  const sql = `SELECT
      o.id AS id,
      o.customer_name AS customer_name,
      o.customer_email AS customer_email,
      o.status AS status,
      o.total_cents AS total_cents,
      o.created_at AS created_at,
      (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
    FROM orders o
    ${where}
    ORDER BY ${column} ${direction}, o.id ${direction}
    LIMIT ?`;

  return { sql, args };
}

export function findOrderPage(db: Database, filters: PageFilters): OrderRow[] {
  const { sql, args } = buildPageQuery(filters);
  return db.prepare(sql).all(...args) as OrderRow[];
}
