import { makeApp, memoryStore, listenHost } from './app.mjs';

let pool;
let store;
if (process.env.DB_HOST) {
  const { connectDatabase } = await import('./postgres.mjs');
  ({ pool, store } = connectDatabase(process.env));
} else {
  // On Cloud Run (K_SERVICE is set) memory mode would lose tasks; refuse to start.
  if (process.env.K_SERVICE) throw new Error('Cloud Run requires persistent DB configuration');
  store = memoryStore();
}

const port = Number(process.env.PORT || 18750);
const server = makeApp(store);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, listenHost(process.env), () => {
  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'task-api listening',
    port,
    store: pool ? 'postgres' : 'memory',
  }));
});

// Cloud Run sends SIGTERM before stopping an instance: finish requests, close the pool.
process.on('SIGTERM', () => {
  server.close(async () => {
    if (pool) await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
});
