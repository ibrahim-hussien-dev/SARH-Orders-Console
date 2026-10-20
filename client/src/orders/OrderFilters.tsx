import { useId } from 'react';
import { ORDER_STATUSES } from '../types';
import type { ListFilters } from '../types';
import { LIMITS } from '../validation';

interface OrderFiltersProps {
  filters: ListFilters;
  onChange: (next: ListFilters) => void;
  simulateSlow: boolean;
  onSimulateSlowChange: (value: boolean) => void;
}

export function OrderFilters({ filters, onChange, simulateSlow, onSimulateSlowChange }: OrderFiltersProps) {
  const baseId = useId();

  return (
    <form className="filters" role="search" onSubmit={(event) => event.preventDefault()}>
      <div className="field">
        <label htmlFor={`${baseId}-q`}>Search name or email</label>
        <input
          id={`${baseId}-q`}
          type="search"
          value={filters.q}
          maxLength={LIMITS.searchMax}
          onChange={(event) => onChange({ ...filters, q: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${baseId}-status`}>Status</label>
        <select
          id={`${baseId}-status`}
          value={filters.status}
          onChange={(event) =>
            onChange({ ...filters, status: ORDER_STATUSES.find((status) => status === event.target.value) ?? '' })
          }
        >
          <option value="">All</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${baseId}-sort`}>Sort by</label>
        <select
          id={`${baseId}-sort`}
          value={filters.sort}
          onChange={(event) =>
            onChange({ ...filters, sort: event.target.value === 'total_cents' ? 'total_cents' : 'created_at' })
          }
        >
          <option value="created_at">Created date</option>
          <option value="total_cents">Total</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${baseId}-dir`}>Direction</label>
        <select
          id={`${baseId}-dir`}
          value={filters.dir}
          onChange={(event) => onChange({ ...filters, dir: event.target.value === 'asc' ? 'asc' : 'desc' })}
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>
      {import.meta.env.DEV && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={simulateSlow}
            onChange={(event) => onSimulateSlowChange(event.target.checked)}
          />
          Simulate slow network
        </label>
      )}
    </form>
  );
}
