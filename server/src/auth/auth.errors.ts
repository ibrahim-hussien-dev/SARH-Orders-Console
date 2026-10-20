import { HttpError } from '../http/errors';

export function unauthenticatedError(): HttpError {
  return new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
}
