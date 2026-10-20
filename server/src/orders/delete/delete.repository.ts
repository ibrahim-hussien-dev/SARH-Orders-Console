import type { Database } from 'better-sqlite3';

export interface DeleteRepository {
  deleteById(id: number): boolean;
}

export function createDeleteRepository(db: Database): DeleteRepository {
  const deleteStatement = db.prepare('DELETE FROM orders WHERE id = ?');

  return {
    deleteById(id) {
      return deleteStatement.run(id).changes > 0;
    },
  };
}
