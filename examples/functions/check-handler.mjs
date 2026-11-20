// Calls the handler with fake request/response objects; opens no port.
import assert from 'node:assert/strict';
import { taskHealth } from './handler.mjs';

for (const method of ['GET', 'POST']) {
  const result = { status: 0, body: null };
  const res = {
    status(code) { result.status = code; return this; },
    set() { return this; },
    json(body) { result.body = body; return this; },
  };
  taskHealth({ method }, res);
  assert.equal(result.status, method === 'GET' ? 200 : 405);
  console.log(JSON.stringify({ method, ...result }));
}
