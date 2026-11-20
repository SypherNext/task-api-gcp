import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { makeApp, memoryStore, listenHost } from '../app.mjs';
import { databaseConfig, postgresStore, connectDatabase } from '../postgres.mjs';

const MISSING_ID = '00000000-0000-0000-0000-000000000000';

// Starts the app on a free loopback port and returns a fetch helper for it.
async function start(t, { store = memoryStore(), log = () => {} } = {}) {
  const server = makeApp(store, log);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();
  const call = (path, options) => fetch(`http://127.0.0.1:${port}${path}`, options);
  return { call, port };
}

const postJson = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const patchJson = body => ({ ...postJson(body), method: 'PATCH' });

test('create, list, complete and delete a task', async t => {
  const { call } = await start(t);
  const created = await call('/tasks', postJson({ title: '  Learn GCP  ' }));
  assert.equal(created.status, 201);
  const task = await created.json();
  assert.equal(task.title, 'Learn GCP');
  assert.equal(task.done, false);
  assert.equal((await (await call('/tasks')).json()).length, 1);
  const patched = await call(`/tasks/${task.id}`, patchJson({ done: true }));
  assert.equal((await patched.json()).done, true);
  assert.equal((await call(`/tasks/${task.id}`, { method: 'DELETE' })).status, 200);
  assert.deepEqual(await (await call('/tasks')).json(), []);
});

test('rejects empty, overlong, non-string titles and non-object JSON', async t => {
  const { call } = await start(t);
  for (const body of [{ title: '' }, { title: ' ' }, { title: 'x'.repeat(201) }, { title: 7 }, [], null]) {
    assert.equal((await call('/tasks', postJson(body))).status, 400);
  }
});

test('rejects malformed JSON and the wrong media type', async t => {
  const { call } = await start(t);
  assert.equal((await call('/tasks', { ...postJson({}), body: '{' })).status, 400);
  assert.equal((await call('/tasks', { method: 'POST', body: 'text' })).status, 415);
});

test('rejects a body larger than 64 KiB', async t => {
  const { call } = await start(t);
  assert.equal((await call('/tasks', postJson({ title: 'x'.repeat(70000) }))).status, 413);
});

test('requires boolean done and reports missing tasks and unknown routes', async t => {
  const { call } = await start(t);
  assert.equal((await call(`/tasks/${MISSING_ID}`, patchJson({ done: 'yes' }))).status, 400);
  assert.equal((await call(`/tasks/${MISSING_ID}`, patchJson({ done: true }))).status, 404);
  assert.equal((await call('/tasks/not-an-id', { method: 'DELETE' })).status, 404);
});

test('deleting a missing task returns 404 with an error, not a deleted id', async t => {
  const { call } = await start(t);
  const response = await call(`/tasks/${MISSING_ID}`, { method: 'DELETE' });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'task not found' });
});

test('health paths avoid Cloud Run reserved names ending in z', async t => {
  const { call } = await start(t);
  assert.equal((await call('/health')).status, 200);
  assert.equal((await call('/ready')).status, 200);
  assert.equal((await call('/healthz')).status, 404);
});

test('separates liveness from readiness and hides the database error', async t => {
  const failing = { async ping() { throw new Error('private-host-password'); } };
  const { call } = await start(t, { store: failing });
  assert.equal((await call('/health')).status, 200);
  const ready = await call('/ready');
  assert.equal(ready.status, 503);
  assert.equal((await ready.text()).includes('private-host'), false);
});

test('sets no-store and a JSON content type', async t => {
  const { call } = await start(t);
  const response = await call('/tasks');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-type'), 'application/json');
});

test('database config rejects missing fields and unencrypted remote TCP', () => {
  assert.throws(() => databaseConfig({}), /required/);
  const env = { DB_HOST: 'db.example.invalid', DB_USER: 'task_app', DB_NAME: 'tasks', DB_PASSWORD: 'test-only' };
  assert.throws(() => databaseConfig(env), /Unix socket/);
  assert.equal(databaseConfig({ ...env, DB_HOST: '/cloudsql/my-project:us-central1:task-db' }).max, 5);
});

test('SQL uses parameters, including for hostile task titles', async () => {
  let seen;
  const pool = { async query(sql, params) { seen = { sql, params }; return { rows: [{ title: params[0] }] }; } };
  const title = "x'); DROP TABLE tasks; --";
  await postgresStore(pool).create(title);
  assert.equal(seen.sql.includes(title), false);
  assert.deepEqual(seen.params, [title]);
});

test('a malformed absolute request target returns 400 and the process keeps running', async t => {
  const { call, port } = await start(t);
  const response = await new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => {
      socket.write('GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
    });
    let data = '';
    socket.on('data', chunk => { data += chunk; });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
  assert.match(response, /HTTP\/1\.1 400/);
  assert.equal((await call('/health')).status, 200);
});

test('loopback by default, explicit container binding and Cloud Run binding', () => {
  assert.equal(listenHost({}), '127.0.0.1');
  assert.equal(listenHost({ BIND_HOST: '0.0.0.0' }), '0.0.0.0');
  assert.equal(listenHost({ K_SERVICE: 'task-api' }), '0.0.0.0');
  assert.throws(() => listenHost({ BIND_HOST: 'public.example' }), /BIND_HOST/);
});

test('logs normalise unknown paths and task identifiers', async t => {
  const logs = [];
  const { call } = await start(t, { log: line => logs.push(JSON.parse(line)) });
  await call('/secret-token-value');
  assert.equal(logs[0].path, '/unknown');
  await call(`/tasks/${MISSING_ID}`);
  assert.equal(logs[1].path, '/tasks/:id');
});

test('idle database errors are logged without driver details', async () => {
  const logs = [];
  const env = { DB_HOST: '127.0.0.1', DB_USER: 'task_app', DB_NAME: 'tasks', DB_PASSWORD: 'test-only' };
  const { pool } = connectDatabase(env, line => logs.push(line));
  pool.emit('error', new Error('secret-password-private-host'));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].includes('secret-password'), false);
  await pool.end();
});
