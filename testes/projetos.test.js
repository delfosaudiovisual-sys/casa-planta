// Projetos: acesso por papel, móveis, configuração, planta (versões e conflito), exportar/importar, compartilhar.
const test = require('node:test');
const assert = require('node:assert');
const { servidorDeTeste, cliente, novaPessoa, ADMIN } = require('./ajuda');

async function preparar(t) {
  const app = await servidorDeTeste(); t.after(() => app.close());
  const admin = cliente(app); await admin.entrar(ADMIN.email, ADMIN.senha);
  const casa = (await admin('GET', '/api/projetos')).json.find(p => p.nome === 'Casa 975');
  return { app, admin, casa };
}

test('primeira vez: Casa 975 com os 28 itens e a configuração exportada', async t => {
  const { admin, casa } = await preparar(t);
  assert.ok(casa); assert.equal(casa.itens, 28); assert.equal(casa.papel, 'dono');
  const p = (await admin('GET', `/api/projetos/${casa.id}`)).json;
  assert.equal(p.planta.lote.largura, 5); assert.equal(p.config.sunSide, 90);
  const itens = (await admin('GET', `/api/projetos/${casa.id}/itens`)).json;
  assert.ok(itens.some(i => i.id === 'pia-banheiro'));
});

test('quem não foi convidado para o projeto não enxerga nada dele', async t => {
  const { app, admin, casa } = await preparar(t);
  const { cliente: ze } = await novaPessoa(app, admin, 'ze@exemplo.com');
  assert.deepEqual((await ze('GET', '/api/projetos')).json, []);
  for (const url of [`/api/projetos/${casa.id}`, `/api/projetos/${casa.id}/itens`, `/api/projetos/${casa.id}/eventos`, `/projeto/${casa.id}/inicio.js`, `/api/projetos/${casa.id}/exportar`]) {
    assert.equal((await ze('GET', url)).status, 404, url);
  }
  assert.equal((await ze('PATCH', `/api/projetos/${casa.id}/itens/pia-banheiro`, { x: 1 })).status, 404);
  assert.equal((await ze('GET', `/projeto/${casa.id}/`)).status, 404);
  assert.equal((await cliente(app)('GET', `/api/projetos/${casa.id}/itens`)).status, 401);
});

test('papéis: leitor só vê, editor altera, só o dono compartilha e apaga', async t => {
  const { app, admin, casa } = await preparar(t);
  const { cliente: leitor } = await novaPessoa(app, admin, 'leitor@exemplo.com');
  const { cliente: editor, id: idEditor } = await novaPessoa(app, admin, 'editor@exemplo.com');
  assert.equal((await admin('POST', `/api/projetos/${casa.id}/membros`, { email: 'leitor@exemplo.com', papel: 'leitor' })).status, 200);
  assert.equal((await admin('POST', `/api/projetos/${casa.id}/membros`, { email: 'editor@exemplo.com', papel: 'editor' })).status, 200);
  const url = `/api/projetos/${casa.id}`;
  assert.equal((await leitor('GET', url + '/itens')).status, 200);
  assert.equal((await leitor('PATCH', url + '/itens/pia-banheiro', { x: 4.5 })).status, 403);
  assert.equal((await leitor('PUT', url + '/config', { sunSide: 0 })).status, 403);
  assert.equal((await editor('PATCH', url + '/itens/pia-banheiro', { x: 4.5 })).status, 200);
  assert.equal((await editor('PUT', url + '/itens/novo-item', { nome: 'Mesa', tipo: 'mesa', w: 1, d: 0.6, h: 0.75, x: 2, y: 10 })).status, 200);
  assert.equal((await editor('DELETE', url + '/itens/novo-item')).status, 200);
  assert.equal((await editor('POST', url + '/membros', { email: 'leitor@exemplo.com', papel: 'dono' })).status, 403);
  assert.equal((await editor('DELETE', url, { confirmar: 'Casa 975' })).status, 403);
  // o dono não pode sair se for o único dono
  const eu = (await admin('GET', '/api/eu')).json;
  assert.equal((await admin('DELETE', `${url}/membros/${eu.id}`)).status, 400);
  // o editor pode sair sozinho
  assert.equal((await editor('DELETE', `${url}/membros/${idEditor}`)).status, 200);
  assert.equal((await editor('GET', url)).status, 404);
});

test('itens perigosos ou malformados são recusados', async t => {
  const { admin, casa } = await preparar(t);
  const url = `/api/projetos/${casa.id}/itens/x1`;
  const base = { nome: 'Sofá', tipo: 'sofa', w: 2, d: 0.9, h: 0.85, x: 3, y: 10 };
  assert.equal((await admin('PUT', url, { ...base, link: 'javascript:alert(1)' })).status, 400);
  assert.equal((await admin('PUT', url, { ...base, cor: 'red;background:url(x)' })).status, 400);
  assert.equal((await admin('PUT', url, { ...base, nome: 'x'.repeat(5000) })).status, 400);
  assert.equal((await admin('PUT', url, { ...base, 'campo com espaço': 1 })).status, 400);
  assert.equal((await admin('PUT', url, { tipo: 'sofa' })).status, 400);
  assert.equal((await admin('PUT', `/api/projetos/${casa.id}/itens/${'a'.repeat(80)}`, base)).status, 400);
  const corpo = '{"nome":"x","__proto__":{"admin":true}}';
  const r = await admin('PUT', url, corpo, { 'content-type': 'application/json' });
  assert.equal(r.status, 400);
  const ok = await admin('PUT', url, { ...base, link: 'https://loja.com.br/sofa', cor: '#aabbcc', grupo: null });
  assert.equal(ok.status, 200);
  const parte = await admin('PATCH', url, { grupo: 'g1', x: 3.5 });
  assert.equal(parte.json.dados.x, 3.5); assert.equal(parte.json.dados.nome, 'Sofá');
  assert.equal((await admin('PATCH', `/api/projetos/${casa.id}/itens/nao-existe`, { x: 1 })).status, 404);
});

test('planta: valida, guarda versões, recusa salvar por cima de outra pessoa', async t => {
  const { admin, casa } = await preparar(t);
  const url = `/api/projetos/${casa.id}`;
  const p = (await admin('GET', url)).json;
  await admin('PUT', url + '/config', { ...p.config, aberturas: { w2o0: { a: 7.5, b: 8.3 } } });
  const ruim = JSON.parse(JSON.stringify(p.planta)); ruim.paredes[1][4][0][1] = 99;
  assert.equal((await admin('PUT', url + '/planta', { planta: ruim, versao: p.plantaVersao })).status, 400);
  const nova = JSON.parse(JSON.stringify(p.planta)); nova.comodos[0].nome = 'Suíte';
  const r = await admin('PUT', url + '/planta', { planta: nova, versao: p.plantaVersao });
  assert.equal(r.status, 200); assert.equal(r.json.versao, p.plantaVersao + 1);
  assert.equal(r.json.planta.portas.length, 5, 'as cinco folhas de porta continuam');
  assert.equal((await admin('PUT', url + '/planta', { planta: nova, versao: p.plantaVersao })).status, 409);
  const vs = (await admin('GET', url + '/plantas')).json;
  assert.equal(vs.length, 1); assert.equal(vs[0].versao, p.plantaVersao);
  const antiga = (await admin('GET', `${url}/plantas/${vs[0].id}`)).json;
  assert.equal(antiga.planta.comodos[0].nome, 'Quarto 1');
  assert.deepEqual((await admin('GET', url + '/config')).json.aberturas, {}, 'ajustes de portas no 3D zeram quando a planta muda');
});

test('novo projeto em branco, cópia, exportar e importar', async t => {
  const { admin, casa } = await preparar(t);
  const r = await admin('POST', '/api/projetos', { nome: 'Sobrado', modelo: 'em-branco', largura: 12, profundidade: 30 });
  assert.equal(r.status, 200);
  const novo = (await admin('GET', `/api/projetos/${r.json.id}`)).json;
  assert.equal(novo.planta.lote.largura, 12); assert.equal(novo.planta.muros.length, 3);
  assert.equal((await admin('POST', '/api/projetos', { nome: 'X', modelo: 'em-branco', largura: 1, profundidade: 30 })).status, 400);
  const exp = await admin('GET', `/api/projetos/${casa.id}/exportar`);
  assert.match(exp.headers['content-disposition'], /casa-975\.json/);
  const arquivo = JSON.parse(exp.corpo);
  const imp = await admin('POST', '/api/projetos', { nome: 'Casa importada', modelo: 'arquivo', arquivo });
  assert.equal(imp.status, 200);
  assert.equal((await admin('GET', `/api/projetos/${imp.json.id}/itens`)).json.length, 28);
  assert.equal((await admin('POST', '/api/projetos', { nome: 'Y', modelo: 'arquivo', arquivo: { formato: 'outro' } })).status, 400);
  const dup = await admin('POST', `/api/projetos/${casa.id}/duplicar`);
  assert.equal((await admin('GET', `/api/projetos/${dup.json.id}`)).json.nome, 'Casa 975 (cópia)');
  assert.equal((await admin('DELETE', `/api/projetos/${dup.json.id}`, { confirmar: 'errado' })).status, 400);
  assert.equal((await admin('DELETE', `/api/projetos/${dup.json.id}`, { confirmar: 'Casa 975 (cópia)' })).status, 200);
  assert.equal((await admin('GET', `/api/projetos/${dup.json.id}`)).status, 404);
});

test('importar itens no projeto (exportação do artefato)', async t => {
  const { admin, casa } = await preparar(t);
  const r = await admin('POST', '/api/projetos', { nome: 'Vazia', modelo: 'casa-975' });
  const itens = require('../dados/itens.json');
  const imp = await admin('POST', `/api/projetos/${r.json.id}/itens/importar`, { itens });
  assert.equal(imp.json.importados, 28);
  assert.equal((await admin('GET', `/api/projetos/${r.json.id}/itens`)).json.length, 28);
  void casa;
});

test('página 3D recebe a planta do projeto e o papel de quem abriu', async t => {
  const { admin, casa } = await preparar(t);
  const r = await admin('GET', `/projeto/${casa.id}/inicio.js`);
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /javascript/);
  assert.match(r.corpo, /^window\.__PLANTA = \{/);
  assert.match(r.corpo, /"papel":"dono"/);
  assert.equal(r.headers['cache-control'], 'no-store');
});
