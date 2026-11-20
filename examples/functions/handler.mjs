export function taskHealth(req, res) {
  if (req.method !== 'GET') {
    res.status(405).set('allow', 'GET').json({ error: 'method not allowed' });
    return;
  }
  res.status(200).set('cache-control', 'no-store').json({ service: 'task-health', status: 'alive' });
}
