CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'agent'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  customer_name_lc TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_email_lc TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- Serves GET /api/orders with sort=created_at and no status filter (keyset on created_at, id).
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC, id DESC);

-- Serves GET /api/orders?status=X with sort=created_at (equality on status, then keyset on created_at, id).
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders (status, created_at DESC, id DESC);

-- Serves GET /api/orders with sort=total_cents and no status filter (keyset on total_cents, id).
CREATE INDEX IF NOT EXISTS idx_orders_total ON orders (total_cents, id);

-- Serves GET /api/orders?status=X with sort=total_cents (equality on status, then keyset on total_cents, id).
CREATE INDEX IF NOT EXISTS idx_orders_status_total ON orders (status, total_cents, id);

-- Serves the itemCount correlated subquery and the ON DELETE CASCADE lookup by order_id.
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items (order_id);
