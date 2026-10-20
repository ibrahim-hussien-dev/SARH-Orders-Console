import { isRecord } from '../guards';

const API_BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type NetworkFailureKind = 'timeout' | 'network';

export class NetworkError extends Error {
  readonly kind: NetworkFailureKind;

  constructor(kind: NetworkFailureKind) {
    super(kind === 'timeout' ? 'The request timed out.' : 'The network request failed.');
    this.name = 'NetworkError';
    this.kind = kind;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

type UnauthorizedListener = () => void;

const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  query?: URLSearchParams;
  signal?: AbortSignal;
  reportUnauthorized?: boolean;
}

export interface ApiResponse<T> {
  status: number;
  headers: Headers;
  data: T;
}

function toTransportError(error: unknown): unknown {
  if (isAbortError(error)) {
    return error;
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new NetworkError('timeout');
  }
  return new NetworkError('network');
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toApiError(status: number, data: unknown): ApiError {
  if (isRecord(data)) {
    const errorField = data['error'];
    if (isRecord(errorField)) {
      const code = typeof errorField['code'] === 'string' ? errorField['code'] : 'UNKNOWN';
      const message = typeof errorField['message'] === 'string' ? errorField['message'] : 'Request failed.';
      return new ApiError(status, code, message, errorField['details']);
    }
  }
  return new ApiError(status, 'UNKNOWN', `Request failed with status ${status}.`);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers);
  const init: RequestInit = {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
  };
  if (options.signal) {
    init.signal = options.signal;
  }
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(options.body);
  }
  const queryText = options.query ? `?${options.query.toString()}` : '';

  let response: Response;
  let data: unknown;
  try {
    response = await fetch(`${API_BASE}${path}${queryText}`, init);
    data = await readJson(response);
  } catch (error) {
    throw toTransportError(error);
  }

  // A transport may finish despite cancellation; stale 401s must not log out
  // a newer session before the list's request gate can discard the response.
  options.signal?.throwIfAborted();
  if (!response.ok) {
    if (response.status === 401 && options.reportUnauthorized !== false) {
      unauthorizedListeners.forEach((listener) => listener());
    }
    throw toApiError(response.status, data);
  }
  return { status: response.status, headers: response.headers, data: data as T };
}

export function describeFailure(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof NetworkError) {
    return error.kind === 'timeout' ? 'The request timed out.' : 'Network error. Check your connection.';
  }
  return 'Something went wrong.';
}
