import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://localhost:8080';
async function request(path, method = 'GET', data) {
  const response = await fetch(base + path, {
    method, headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  return { status: response.status, body };
}
let id;
try {
  const page = await fetch(base, { signal: AbortSignal.timeout(15000) });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /app-root/);
  assert.equal((await request('/api/health')).body.status, 'ok');
  assert.equal((await request('/api/contacts', 'POST', { name: '', phone: 'abc' })).status, 400);
  const created = await request('/api/contacts', 'POST', { name: 'Teste ' + Date.now(), phone: '(11) 99999-1234' });
  assert.equal(created.status, 201);
  id = created.body.id;
  assert.ok(Number.isInteger(id));
  const list = await request('/api/contacts');
  assert.equal(list.status, 200);
  assert.ok(list.body.some(contact => contact.id === id));
  const updated = await request('/api/contacts/' + id, 'PUT', { name: 'Contato atualizado', phone: '11988887777' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, 'Contato atualizado');
  const saved = (await request('/api/contacts')).body.find(contact => contact.id === id);
  assert.equal(saved.phone, '11988887777');
  assert.equal((await request('/api/contacts/' + id, 'DELETE')).status, 200);
  assert.equal((await request('/api/contacts/' + id, 'PUT', { name: 'Ausente', phone: '123' })).status, 404);
  assert.equal((await request('/api/contacts/' + id, 'DELETE')).status, 404);
  assert.equal((await request('/api/contacts')).body.some(contact => contact.id === id), false);
  id = undefined;
  console.log('OK: frontend, saúde do banco, validação, inserção, listagem, alteração, exclusão e 404.');
} finally {
  if (id !== undefined) await request('/api/contacts/' + id, 'DELETE');
}
