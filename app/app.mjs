import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const MAX_BODY_BYTES = 65536;
const MAX_TITLE_LENGTH = 200;
const TASK_PATH = /^\/tasks\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
// Cloud Run reserves some URL paths that end in "z" (such as /healthz), so the
// health endpoints are /health and /ready.
const KNOWN_PATHS = new Set(['/', '/tasks', '/health', '/ready']);

// Local runs listen on loopback only; containers and Cloud Run need 0.0.0.0.
export function listenHost(env) {
  if (env.K_SERVICE) return '0.0.0.0';
  if (env.BIND_HOST && !['127.0.0.1', '0.0.0.0'].includes(env.BIND_HOST)) {
    throw new Error('BIND_HOST must be a loopback or container bind address');
  }
  return env.BIND_HOST || '127.0.0.1';
}

// Temporary store for local demonstrations. Tasks vanish when the process stops.
export function memoryStore() {
  const tasks = new Map();
  return {
    async ping() {
      return true;
    },
    async list() {
      return [...tasks.values()].slice(0, 100);
    },
    async create(title) {
      const task = { id: randomUUID(), title, done: false };
      tasks.set(task.id, task);
      return task;
    },
    async complete(id, done) {
      const task = tasks.get(id);
      if (!task) return null;
      task.done = done;
      return task;
    },
    async remove(id) {
      return tasks.delete(id);
    },
  };
}

// Reads a JSON request body, or returns null when it is larger than the limit.
async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function routeName(path) {
  if (KNOWN_PATHS.has(path)) return path;
  if (TASK_PATH.test(path)) return '/tasks/:id';
  return '/unknown';
}

export function makeApp(store, log = console.log) {
  return createServer(async (req, res) => {
    const started = Date.now();

    let path;
    try {
      path = new URL(req.url, 'http://localhost').pathname;
    } catch {
      res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ error: 'invalid request target' }));
      return;
    }

    const send = (status, body) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(JSON.stringify(body));
      // Route category only: never task IDs, bodies or unknown paths.
      log(JSON.stringify({
        severity: status >= 500 ? 'ERROR' : 'INFO',
        method: req.method,
        path: routeName(path),
        status,
        ms: Date.now() - started,
      }));
    };

    try {
      if (req.method === 'GET' && path === '/health') return send(200, { status: 'alive' });
      if (req.method === 'GET' && path === '/ready') {
        await store.ping();
        return send(200, { status: 'ready' });
      }
      if (req.method === 'GET' && path === '/') return send(200, { service: 'task-api', version: '1.0.0' });
      if (req.method === 'GET' && path === '/tasks') return send(200, await store.list());

      const match = path.match(TASK_PATH);
      if (req.method === 'DELETE' && match) {
        const removed = await store.remove(match[1]);
        return removed ? send(200, { deleted: match[1] }) : send(404, { error: 'task not found' });
      }

      const isCreate = req.method === 'POST' && path === '/tasks';
      const isUpdate = req.method === 'PATCH' && match;
      if (!isCreate && !isUpdate) return send(404, { error: 'not found' });

      if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        return send(415, { error: 'use application/json' });
      }
      const raw = await readBody(req);
      if (raw === null) return send(413, { error: 'body exceeds 64 KiB' });

      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(400, { error: 'invalid JSON' });
      }
      if (!body || Array.isArray(body) || typeof body !== 'object') {
        return send(400, { error: 'JSON object required' });
      }

      if (isCreate) {
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (title.length < 1 || title.length > MAX_TITLE_LENGTH) {
          return send(400, { error: 'title must contain 1 to 200 characters' });
        }
        return send(201, await store.create(title));
      }

      if (typeof body.done !== 'boolean') return send(400, { error: 'done must be a boolean' });
      const task = await store.complete(match[1], body.done);
      return task ? send(200, task) : send(404, { error: 'task not found' });
    } catch {
      // Generic message: database errors can contain host names or credentials.
      return send(path === '/ready' ? 503 : 500, { error: 'service unavailable' });
    }
  });
}
