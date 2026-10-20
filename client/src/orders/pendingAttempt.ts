import { isRecord } from '../guards';
import type { CreateOrderBody } from '../types';
import { parseNormalizedBody } from '../validation';
import { isUuidV4 } from './idempotency';

const STORAGE_KEY = 'sarh.orders.pendingAttempt.v1';
const PROBE_KEY = 'sarh.orders.storageProbe';

export interface PendingAttempt {
  userId: number;
  key: string;
  body: CreateOrderBody;
}

function getStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function isPersistenceAvailable(): boolean {
  const storage = getStorage();
  if (storage === null) {
    return false;
  }
  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

function parseAttempt(raw: string): PendingAttempt | null {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  const userId = value['userId'];
  const key = value['key'];
  const body = parseNormalizedBody(value['body']);
  if (typeof userId !== 'number' || !Number.isInteger(userId) || typeof key !== 'string' || !isUuidV4(key) || body === null) {
    return null;
  }
  return { userId, key, body };
}

function readStoredAttempt(): PendingAttempt | null {
  const storage = getStorage();
  if (storage === null) {
    return null;
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw === null ? null : parseAttempt(raw);
  } catch {
    return null;
  }
}

export function loadPendingAttempt(userId: number): PendingAttempt | null {
  const stored = readStoredAttempt();
  return stored !== null && stored.userId === userId ? stored : null;
}

export function savePendingAttempt(attempt: PendingAttempt): boolean {
  const storage = getStorage();
  if (storage === null) {
    return false;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(attempt));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingAttempt(): void {
  try {
    getStorage()?.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

export function discardAttemptsOfOtherUsers(userId: number): void {
  const stored = readStoredAttempt();
  if (stored === null || stored.userId !== userId) {
    clearPendingAttempt();
  }
}
