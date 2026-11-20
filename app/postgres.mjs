import pg from 'pg';

export function databaseConfig(env) {
  const host = env.DB_HOST;
  if (!host || !env.DB_USER || !env.DB_NAME || !env.DB_PASSWORD) {
    throw new Error('DB_HOST, DB_USER, DB_NAME and DB_PASSWORD are required');
  }
  // Accept only the Cloud SQL Unix socket (encrypted by the connector) or a local
  // database. A remote TCP host would need certificate checking this lab does not set up.
  if (!host.startsWith('/cloudsql/') && !['127.0.0.1', 'localhost'].includes(host)) {
    throw new Error('Use the Cloud SQL Unix socket or a local proxy; do not disable TLS on a remote TCP connection');
  }
  return {
    host,
    port: Number(env.DB_PORT || 5432),
    user: env.DB_USER,
    database: env.DB_NAME,
    password: env.DB_PASSWORD,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  };
}

export function postgresStore(pool) {
  return {
    async ping() {
      await pool.query('SELECT 1');
    },
    async list() {
      const result = await pool.query('SELECT id, title, done FROM tasks ORDER BY created_at, id LIMIT 100');
      return result.rows;
    },
    async create(title) {
      const result = await pool.query('INSERT INTO tasks (title) VALUES ($1) RETURNING id, title, done', [title]);
      return result.rows[0];
    },
    async complete(id, done) {
      const result = await pool.query('UPDATE tasks SET done = $2 WHERE id = $1 RETURNING id, title, done', [id, done]);
      return result.rows[0] ?? null;
    },
    async remove(id) {
      const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
      return result.rowCount > 0;
    },
  };
}

export function connectDatabase(env, log = console.log) {
  const pool = new pg.Pool(databaseConfig(env));
  // Log a fixed message: the driver's error text can include host names.
  pool.on('error', () => log(JSON.stringify({ severity: 'ERROR', message: 'idle database connection failed' })));
  return { pool, store: postgresStore(pool) };
}
