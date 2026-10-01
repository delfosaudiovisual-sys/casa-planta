// Contas: entrar, convites, senhas, administração e proteções (bloqueio, CSRF).
const test = require('node:test');
const assert = require('node:assert');
const { servidorDeTeste, cliente, novaPessoa, ADMIN } = require('./ajuda');

test('entrar e sair', async t => {
  const app = await servidorDeTeste(); t.after(() => app.close());
  const c = cliente(app);
  assert.equal((await c('GET', '/api/eu')).status, 401);
  assert.equal((await c('POST', '/api/entrar', { email: ADMIN.email, senha: 'errada-errada' })).status, 401);
  const r = await c('POST', '/api/entrar', { email: ADMIN.email.toUpperCase(), senha: ADMIN.senha });
  assert.equal(r.status, 200);
  const sc = String(r.headers['set-cookie']);
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/);
  const eu = await c('GET', '/api/eu');
  assert.equal(eu.status, 200); assert.equal(eu.json.admin, true);
  await c('POST', '/api/sair');
  assert.equal((await c('GET', '/api/eu')).status, 401);
});

test('cookie seguro em produção (__Host- e Secure)', async t => {
  const app = await servidorDeTeste({ COOKIE_SEGURO: '1' }); t.after(() => app.close());
  const r = await app.inject({ method: 'POST', url: '/api/entrar', payload: { email: ADMIN.email, senha: ADMIN.senha } });
  assert.match(String(r.headers['set-cookie']), /^__Host-sessao=.*Secure/);
  assert.match(r.headers['strict-transport-security'] || '', /max-age/);
});

test('convite: só funciona uma vez, exige senha boa e já entra', async t => {
  const app = await servidorDeTeste(); t.after(() => app.close());
  const admin = cliente(app); await admin.entrar(ADMIN.email, ADMIN.senha);
  const r = await admin('POST', '/api/usuarios', { email: 'ana@exemplo.com', nome: 'Ana' });
  assert.equal(r.status, 200);
  assert.match(r.json.link, /\/convite#[A-Za-z0-9_-]{40,}$/);
  const token = r.json.link.split('#')[1];
  const ana = cliente(app);
  assert.equal((await ana('POST', '/api/convites/ver', { token })).json.email, 'ana@exemplo.com');
  assert.equal((await ana('POST', '/api/convites/aceitar', { token, senha: '123' })).status, 400);
  assert.equal((await ana('POST', '/api/convites/aceitar', { token, senha: '1234567890' })).status, 400);
  assert.equal((await ana('POST', '/api/convites/aceitar', { token, senha: 'uma-senha-forte-1' })).status, 200);
  assert.equal((await ana('GET', '/api/eu')).json.email, 'ana@exemplo.com');
  assert.equal((await cliente(app)('POST', '/api/convites/aceitar', { token, senha: 'outra-senha-forte-2' })).status, 404);
  assert.equal((await admin('POST', '/api/usuarios', { email: 'ANA@exemplo.com' })).status, 409);
});

test('só o administrador administra pessoas', async t => {
  const app = await servidorDeTeste(); t.after(() => app.close());
  const admin = cliente(app); await admin.entrar(ADMIN.email, ADMIN.senha);
  const { cliente: bia } = await novaPessoa(app, admin, 'bia@exemplo.com');
  assert.equal((await bia('GET', '/api/usuarios')).status, 403);
  assert.equal((await bia('POST', '/api/usuarios', { email: 'x@exemplo.com' })).status, 403);
  assert.equal((await bia('GET', '/api/admin/copia')).status, 403);
  // não dá para tirar o último administrador
  const eu = (await admin('GET', '/api/eu')).json;
  assert.equal((await admin('PATCH', `/api/usuarios/${eu.id}`, { admin: false })).status, 400);
});

test('desativar tira a pessoa na hora', async t => {
  const app = await servidorDeTeste(); t.after(() => app.close());
  const admin = cliente(app); await admin.entrar(ADMIN.email, ADMIN.senha);
  const { cliente: caio, id } = await novaPessoa(app, admin, 'caio@exemplo.com', 'outra-senha-boa-000');
  assert.equal((await caio('GET', '/api/eu')).status, 200);
  assert.equal((await admin('PATCH', `/api/usuarios/${id}`, { ativo: false })).status, 200);
  assert.equal((await caio('GET', '/api/eu')).status, 401);
  assert.equal((await cliente(app)('POST', '/api/entrar', { email: 'caio@exemplo.com', senha: 'outra-senha-boa-000' })).status, 401);
});

test('trocar a senha desconecta os outros aparelhos', async t => {
  const app = await servidorDeTeste(); t.after(() => app.close());
  const a = cliente(app), b = cliente(app);
  await a.entrar(ADMIN.email, ADMIN.senha); await b.entrar(ADMIN.email, ADMIN.senha);
  assert.equal((await a('POST', '/api/eu/senha', { atual: 'errada-errada', nova: 'nova-senha-muito-boa' })).status, 400);
  assert.equal((await a('POST', '/api/eu/senha', { atual: ADMIN.senha, nova: 'nova-senha-muito-boa' })).status, 200);
  assert.equal((await a('GET', '/api/eu')).status, 200);
  assert.equal((await b('GET', '/api/eu')).status, 401);
});

test('muitas senhas erradas bloqueiam o e-mail por um tempo', async t => {
  const app = await servidorDeTeste(); t.after(() => app.close());
  for (let i = 0; i < 5; i++) await app.inject({ method: 'POST', url: '/api/entrar', payload: { email: ADMIN.email, senha: 'errada-' + i }, remoteAddress: '10.0.0.' + i });
  const r = await app.inject({ method: 'POST', url: '/api/entrar', payload: { email: ADMIN.email, senha: ADMIN.senha }, remoteAddress: '10.0.1.1' });
  assert.equal(r.statusCode, 429);
});

test('limite de tentativas por IP', async t => {
  const app = await servidorDeTeste(); t.after(() => app.close());
  let ultimo;
  for (let i = 0; i < 11; i++) ultimo = await app.inject({ method: 'POST', url: '/api/entrar', payload: { email: `x${i}@exemplo.com`, senha: 'qualquer-coisa' } });
  assert.equal(ultimo.statusCode, 429);
});

test('pedidos de outro site são recusados (CSRF)', async t => {
  const app = await servidorDeTeste(); t.after(() => app.close());
  const c = cliente(app); await c.entrar(ADMIN.email, ADMIN.senha);
  assert.equal((await c('PATCH', '/api/eu', { nome: 'X' }, { origin: 'https://site-ruim.com' })).status, 403);
  assert.equal((await c('PATCH', '/api/eu', { nome: 'X' }, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await c('PATCH', '/api/eu', { nome: 'X' }, { origin: 'http://localhost:8080' })).status, 403);
  assert.equal((await c('PATCH', '/api/eu', { nome: 'Fulano' }, { origin: 'http://localhost:80' })).status, 200);
  assert.equal((await c('PATCH', '/api/eu', { nome: 'Fulano' })).status, 200);
});

test('cabeçalhos de segurança nas páginas', async t => {
  const app = await servidorDeTeste(); t.after(() => app.close());
  const r = await app.inject({ url: '/entrar' });
  const csp = r.headers['content-security-policy'];
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['referrer-policy'], 'same-origin');
  // sem login, páginas internas mandam para /entrar
  const p = await app.inject({ url: '/projetos' });
  assert.equal(p.statusCode, 302); assert.match(p.headers.location, /^\/entrar\?volta=/);
});
