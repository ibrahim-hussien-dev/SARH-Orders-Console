import { useState } from 'react';
import { describeFailure } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import type { ListFilters, OrderSummary } from '../types';
import { CreateOrderForm } from './CreateOrderForm';
import { OrderFilters } from './OrderFilters';
import { OrdersTable } from './OrdersTable';
import { useDeleteOrder } from './useDeleteOrder';
import { useOrders } from './useOrders';

const DEFAULT_FILTERS: ListFilters = { q: '', status: '', sort: 'created_at', dir: 'desc' };

export function OrdersPage() {
  const { user, logout } = useAuth();
  const [filters, setFilters] = useState<ListFilters>(DEFAULT_FILTERS);
  const [simulateSlow, setSimulateSlow] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const orders = useOrders({ ...filters, simulateSlow });
  const deletion = useDeleteOrder(orders.reload);

  if (user === null) {
    return null;
  }

  function handleDelete(order: OrderSummary) {
    const confirmed = window.confirm(
      `Delete order #${order.id} for ${order.customerName}? This cannot be undone.`,
    );
    if (confirmed) {
      void deletion.remove(order.id);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
    } catch (error) {
      setLogoutError(describeFailure(error));
      setLoggingOut(false);
    }
  }

  const showEmpty = !orders.loading && orders.error === null && orders.items.length === 0;

  return (
    <div className="layout">
      <header className="topbar">
        <h1>SARH Orders Console</h1>
        <div className="topbar-user">
          <span>
            {user.email} ({user.role})
          </span>
          <button type="button" onClick={() => void handleLogout()} disabled={loggingOut}>
            {loggingOut ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      </header>
      {logoutError !== null && (
        <p className="error" role="alert">
          {logoutError}
        </p>
      )}

      <main>
        <CreateOrderForm userId={user.id} onCreated={orders.reload} />

        <section className="card" aria-labelledby="orders-title">
          <h2 id="orders-title">Orders</h2>
          <OrderFilters
            filters={filters}
            onChange={setFilters}
            simulateSlow={simulateSlow}
            onSimulateSlowChange={setSimulateSlow}
          />

          {deletion.error !== null && (
            <p className="error" role="alert">
              {deletion.error}
            </p>
          )}

          <div aria-busy={orders.loading}>
            {orders.loading && (
              <p role="status" className="notice">
                Loading orders…
              </p>
            )}
            {orders.error !== null && (
              <div role="alert" className="error">
                <p>{orders.error}</p>
                <button type="button" onClick={orders.reload}>
                  Retry
                </button>
              </div>
            )}
            {showEmpty && (
              <p role="status" className="notice">
                No orders match these filters.
              </p>
            )}
            {orders.items.length > 0 && (
              <OrdersTable items={orders.items} deletingId={deletion.deletingId} onDelete={handleDelete} />
            )}
          </div>

          {orders.loadMoreError !== null && (
            <p className="error" role="alert">
              {orders.loadMoreError}
            </p>
          )}
          {orders.hasMore && (
            <button type="button" onClick={orders.loadMore} disabled={orders.loadingMore}>
              {orders.loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
