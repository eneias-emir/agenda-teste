import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://localhost:8080';
const phase = process.env.PERSISTENCE_PHASE;
if (phase === 'create') {
  const response = await fetch(base + '/api/contacts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Teste de persistência', phone: '11977776666' }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 201);
  console.log((await response.json()).id);
} else if (phase === 'check') {
  const id = Number(process.env.CONTACT_ID);
  assert.ok(Number.isInteger(id) && id > 0);
  const response = await fetch(base + '/api/contacts', { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  const contact = (await response.json()).find(item => item.id === id);
  assert.equal(contact?.name, 'Teste de persistência');
  assert.equal(contact?.phone, '11977776666');
  assert.equal((await fetch(base + '/api/contacts/' + id, { method: 'DELETE', signal: AbortSignal.timeout(15000) })).status, 200);
  console.log('OK: contato preservado após recriar os containers; contato de teste removido.');
} else {
  throw new Error('Defina PERSISTENCE_PHASE=create ou check e CONTACT_ID para check.');
}
