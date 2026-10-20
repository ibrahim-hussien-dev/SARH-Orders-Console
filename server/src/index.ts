import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db/connection';

const config = loadConfig();
const db = openDatabase(config.dbPath);
const server = createApp(db, config).listen(config.port, '127.0.0.1', () => {
  console.log(`SARH API ready at http://localhost:${config.port}`);
});
server.on('error', (error) => {
  console.error('Server could not start:', error.message);
  db.close();
  process.exitCode = 1;
});
function shutdown(): void {
  server.close(() => {
    db.close();
    process.exitCode = 0;
  });
  server.closeIdleConnections();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
