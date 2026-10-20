import { useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { formatMoney } from '../money';
import { bodySignature, LIMITS, validateDraft } from '../validation';
import { draftFromBody, emptyDraft, newItemDraft } from './orderDraft';
import type { ItemDraft, OrderDraft } from './orderDraft';
import { useCreateOrder } from './useCreateOrder';

interface CreateOrderFormProps {
  userId: number;
  onCreated: () => void;
}

export function CreateOrderForm({ userId, onCreated }: CreateOrderFormProps) {
  const create = useCreateOrder(userId, handleCreated);
  const [draft, setDraft] = useState<OrderDraft>(() =>
    create.initialBody === null ? emptyDraft() : draftFromBody(create.initialBody),
  );
  const [showErrors, setShowErrors] = useState(false);
  const baseId = useId();

  const validation = useMemo(() => validateDraft(draft), [draft]);
  const currentSignature = validation.body === null ? null : bodySignature(validation.body);
  const submitting = create.phase === 'submitting';
  const editedAfterUncertainFailure =
    create.phase === 'retryable' && create.pendingSignature !== null && create.pendingSignature !== currentSignature;
  const canRetry = create.phase === 'retryable' && !editedAfterUncertainFailure;
  const errors = validation.errors;

  function handleCreated() {
    setDraft(emptyDraft());
    setShowErrors(false);
    onCreated();
  }

  function updateDraft(next: OrderDraft) {
    setDraft(next);
    create.dismissNotice();
  }

  function updateItem(rowId: string, patch: Partial<Omit<ItemDraft, 'rowId'>>) {
    updateDraft({
      ...draft,
      items: draft.items.map((item) => (item.rowId === rowId ? { ...item, ...patch } : item)),
    });
  }

  function addItem() {
    if (draft.items.length < LIMITS.itemsMax) {
      updateDraft({ ...draft, items: [...draft.items, newItemDraft()] });
    }
  }

  function removeItem(rowId: string) {
    if (draft.items.length > LIMITS.itemsMin) {
      updateDraft({ ...draft, items: draft.items.filter((item) => item.rowId !== rowId) });
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowErrors(true);
    if (validation.body === null) {
      return;
    }
    void create.submit(validation.body);
  }

  return (
    <section className="card" aria-labelledby={`${baseId}-title`}>
      <h2 id={`${baseId}-title`}>Create order</h2>
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <fieldset disabled={submitting}>
          <div className="field">
            <label htmlFor={`${baseId}-name`}>Customer name</label>
            <input
              id={`${baseId}-name`}
              value={draft.customerName}
              maxLength={LIMITS.nameMax * 2}
              aria-invalid={showErrors && errors.customerName !== undefined}
              onChange={(event) => updateDraft({ ...draft, customerName: event.target.value })}
            />
            {showErrors && errors.customerName !== undefined && <p className="field-error">{errors.customerName}</p>}
          </div>
          <div className="field">
            <label htmlFor={`${baseId}-email`}>Customer email</label>
            <input
              id={`${baseId}-email`}
              type="email"
              value={draft.customerEmail}
              maxLength={LIMITS.emailMax * 2}
              aria-invalid={showErrors && errors.customerEmail !== undefined}
              onChange={(event) => updateDraft({ ...draft, customerEmail: event.target.value })}
            />
            {showErrors && errors.customerEmail !== undefined && <p className="field-error">{errors.customerEmail}</p>}
          </div>

          <h3>Items</h3>
          {showErrors && errors.itemCount !== undefined && <p className="field-error">{errors.itemCount}</p>}
          {draft.items.map((item, index) => {
            const itemErrors = errors.items[index] ?? {};
            const rowLabel = `Item ${index + 1}`;
            return (
              <div className="item-row" key={item.rowId} role="group" aria-label={rowLabel}>
                <div className="field">
                  <label htmlFor={`${baseId}-${item.rowId}-product`}>Product</label>
                  <input
                    id={`${baseId}-${item.rowId}-product`}
                    value={item.productName}
                    aria-invalid={showErrors && itemErrors.productName !== undefined}
                    onChange={(event) => updateItem(item.rowId, { productName: event.target.value })}
                  />
                  {showErrors && itemErrors.productName !== undefined && (
                    <p className="field-error">{itemErrors.productName}</p>
                  )}
                </div>
                <div className="field">
                  <label htmlFor={`${baseId}-${item.rowId}-qty`}>Quantity</label>
                  <input
                    id={`${baseId}-${item.rowId}-qty`}
                    inputMode="numeric"
                    value={item.quantity}
                    aria-invalid={showErrors && itemErrors.quantity !== undefined}
                    onChange={(event) => updateItem(item.rowId, { quantity: event.target.value })}
                  />
                  {showErrors && itemErrors.quantity !== undefined && (
                    <p className="field-error">{itemErrors.quantity}</p>
                  )}
                </div>
                <div className="field">
                  <label htmlFor={`${baseId}-${item.rowId}-price`}>Unit price</label>
                  <input
                    id={`${baseId}-${item.rowId}-price`}
                    inputMode="decimal"
                    placeholder="19.99"
                    value={item.unitPrice}
                    aria-invalid={showErrors && itemErrors.unitPrice !== undefined}
                    onChange={(event) => updateItem(item.rowId, { unitPrice: event.target.value })}
                  />
                  {showErrors && itemErrors.unitPrice !== undefined && (
                    <p className="field-error">{itemErrors.unitPrice}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.rowId)}
                  disabled={draft.items.length <= LIMITS.itemsMin}
                  aria-label={`Remove ${rowLabel}`}
                >
                  Remove
                </button>
              </div>
            );
          })}
          <button type="button" onClick={addItem} disabled={draft.items.length >= LIMITS.itemsMax}>
            Add item
          </button>

          <p className="total">
            Total (computed, read-only):{' '}
            <output aria-live="polite">{validation.totalCents === null ? '—' : formatMoney(validation.totalCents)}</output>
          </p>
        </fieldset>

        <div className="actions">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create order'}
          </button>
          {canRetry && (
            <button type="button" onClick={() => void create.retry()} disabled={submitting}>
              Retry
            </button>
          )}
        </div>
      </form>

      {submitting && (
        <p role="status" className="notice">
          Sending order…
        </p>
      )}
      {create.phase === 'success' && create.message !== null && (
        <p role="status" className="success">
          {create.message}
        </p>
      )}
      {(create.phase === 'retryable' || create.phase === 'conflict' || create.phase === 'rejected') &&
        create.message !== null && (
          <p role="alert" className="error">
            {create.message}
          </p>
        )}
      {editedAfterUncertainFailure && (
        <p role="alert" className="warning">
          You changed the order after an uncertain failure. If the earlier attempt actually succeeded, submitting the
          changed order will create a second order.
        </p>
      )}
      {create.storageWarning && (
        <p className="warning">
          Browser storage is unavailable, so reload protection is reduced: if you reload after an uncertain failure, a
          new submission gets a new key and could create a duplicate.
        </p>
      )}
    </section>
  );
}
