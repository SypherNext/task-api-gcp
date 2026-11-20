// Integration check against a real, disposable PostgreSQL 18 container.
// Run with: npm run test:postgres   (needs Docker; uses loopback port 18751)
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import pg from 'pg';
import { makeApp } from './app.mjs';
import { postgresStore } from './postgres.mjs';

const password = randomUUID();
const container = 'gcf-postgres';
const root = 'http://127.0.0.1:18750';
const json = body => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function docker(args, env = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', env: { ...process.env, ...env } });
  if (result.status) throw new Error(result.stderr);
  return result.stdout.trim();
}

async function startApp(pool) {
  const server = makeApp(postgresStore(pool), () => {});
  server.listen(18750, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

let pool;
let server;
try {
  docker(['run', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=tasks',
    '-p', '127.0.0.1:18751:5432', 'postgres:18'], { POSTGRES_PASSWORD: password });
  pool = new pg.Pool({ host: '127.0.0.1', port: 18751, user: 'postgres', database: 'tasks', password, max: 2 });
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try {
      await pool.query('SELECT 1');
      ready = true;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  assert.ok(ready, 'postgres readiness');
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));

  // 1. A task with SQL-looking text is stored as data.
  server = await startApp(pool);
  const created = await fetch(`${root}/tasks`, { method: 'POST', ...json({ title: "Persist O'Reilly; DROP TABLE tasks" }) });
  assert.equal(created.status, 201);
  const task = await created.json();

  // 2. It survives an API restart, because it lives in PostgreSQL.
  await new Promise(resolve => server.close(resolve));
  server = await startApp(pool);
  const list = await (await fetch(`${root}/tasks`)).json();
  assert.equal(list[0].id, task.id);
  assert.equal(list[0].title, task.title);

  // 3. PATCH updates it.
  const patched = await fetch(`${root}/tasks/${task.id}`, { method: 'PATCH', ...json({ done: true }) });
  assert.equal((await patched.json()).done, true);

  // 4 and 5. The narrow runtime role can write rows but cannot drop the table.
  await pool.query(`CREATE ROLE task_app_role NOLOGIN;
    GRANT CONNECT ON DATABASE tasks TO task_app_role;
    GRANT USAGE ON SCHEMA public TO task_app_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO task_app_role;
    CREATE ROLE task_app LOGIN;
    GRANT task_app_role TO task_app;`);
  await pool.query('SET ROLE task_app');
  await pool.query('INSERT INTO tasks (title) VALUES ($1)', ['least privilege test']);
  await assert.rejects(pool.query('DROP TABLE tasks'), /owner|permission/);
  await pool.query('RESET ROLE');

  // 6. Readiness reports the database as reachable.
  assert.equal((await fetch(`${root}/ready`)).status, 200);
  console.log('PostgreSQL 18 integration: persisted across API restart; safe SQL title; PATCH; readiness; app role CRUD allowed and DROP denied. 6 checks passed.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  docker(['rm', '-f', container]);
}
