import { AdminOnly } from '../auth/AdminOnly';
import { formatMoney } from '../money';
import type { OrderSummary } from '../types';

interface OrdersTableProps {
  items: OrderSummary[];
  deletingId: number | null;
  onDelete: (order: OrderSummary) => void;
}

export function OrdersTable({ items, deletingId, onDelete }: OrdersTableProps) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="visually-hidden">Orders</caption>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Customer</th>
            <th scope="col">Email</th>
            <th scope="col">Status</th>
            <th scope="col">Items</th>
            <th scope="col">Total</th>
            <th scope="col">Created</th>
            <AdminOnly>
              <th scope="col">Actions</th>
            </AdminOnly>
          </tr>
        </thead>
        <tbody>
          {items.map((order) => (
            <tr key={order.id}>
              <td>{order.id}</td>
              <td>{order.customerName}</td>
              <td>{order.customerEmail}</td>
              <td>
                <span className={`status status-${order.status}`}>{order.status}</span>
              </td>
              <td>{order.itemCount}</td>
              <td>{formatMoney(order.totalCents)}</td>
              <td>{new Date(order.createdAt).toLocaleString()}</td>
              <AdminOnly>
                <td>
                  <button
                    type="button"
                    className="danger"
                    disabled={deletingId !== null}
                    onClick={() => onDelete(order)}
                    aria-label={`Delete order ${order.id}`}
                  >
                    {deletingId === order.id ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </AdminOnly>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
