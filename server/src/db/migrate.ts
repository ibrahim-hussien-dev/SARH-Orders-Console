import fs from 'fs';
import path from 'path';
import type { Database } from 'better-sqlite3';

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

export function migrate(db: Database): void {
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}
