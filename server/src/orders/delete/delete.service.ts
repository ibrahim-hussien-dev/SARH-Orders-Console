import { HttpError } from '../../http/errors';
import type { DeleteRepository } from './delete.repository';

export interface DeleteService {
  deleteOrder(id: number): void;
}

export function createDeleteService(repository: DeleteRepository): DeleteService {
  return {
    deleteOrder(id) {
      if (!repository.deleteById(id)) {
        throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
      }
    },
  };
}
