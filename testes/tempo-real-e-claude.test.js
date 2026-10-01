// Tempo real (eventos chegam para quem está com o projeto aberto), planta de fundo e funções com o Claude (com um Claude falso).
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const zlib = require('zlib');
const { servidorDeTeste, cliente, novaPessoa, ADMIN } = require('./ajuda');
const Planta = require('../compartilhado/planta');

function ouvirEventos(porta, url, cookie) {
  const eventos = [];
  let resolver = null;
  const req = http.get({ host: '127.0.0.1', port: porta, path: url, headers: { cookie } }, res => {
    res.setEncoding('utf8'); let buf = '';
    res.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const bloco = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(bloco), dados = /^data: (.+)$/m.exec(bloco);
        if (ev) { eventos.push({ evento: ev[1], dados: JSON.parse(dados[1]) }); if (resolver) resolver(); }
      }
    });
  });
  return {
    eventos, fechar: () => req.destroy(),
    async esperar(fn, ms = 3000) {
      const fim = Date.now() + ms;
      while (Date.now() < fim) { const e = eventos.find(fn); if (e) return e; await new Promise(r => { resolver = r; setTimeout(r, 50); }); }
      throw new Error('evento não chegou');
    },
  };
}

test('tempo real: lista ao conectar, mudanças dos outros e perda de acesso', async t => {
  const app = await servidorDeTeste(); t.after(() => app.close());
  await app.listen({ port: 0, host: '127.0.0.1' });
  const porta = app.server.address().port;
  const admin = cliente(app); await admin.entrar(ADMIN.email, ADMIN.senha);
  const casa = (await admin('GET', '/api/projetos')).json[0];
  const { cliente: dani, id: idDani } = await novaPessoa(app, admin, 'dani@exemplo.com');
  await admin('POST', `/api/projetos/${casa.id}/membros`, { email: 'dani@exemplo.com', papel: 'editor' });
  const ev = ouvirEventos(porta, `/api/projetos/${casa.id}/eventos`, dani.cookie());
  t.after(() => ev.fechar());
  const inicial = await ev.esperar(e => e.evento === 'itens');
  assert.equal(inicial.dados.length, 28);
  await admin('PATCH', `/api/projetos/${casa.id}/itens/pia-banheiro`, { nome: 'Pia nova' });
  const mud = await ev.esperar(e => e.evento === 'item' && e.dados.dados && e.dados.dados.nome === 'Pia nova');
  assert.equal(mud.dados.id, 'pia-banheiro');
  await admin('DELETE', `/api/projetos/${casa.id}/itens/pia-banheiro`);
  await ev.esperar(e => e.evento === 'item' && e.dados.apagado);
  await admin('DELETE', `/api/projetos/${casa.id}/membros/${idDani}`);
  await ev.esperar(e => e.evento === 'acesso');
});

// PNG de 1×1 pixel
function pngMinimo() {
  const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const pedaco = (tipo, dados) => { const l = Buffer.alloc(4); l.writeUInt32BE(dados.length); const td = Buffer.concat([Buffer.from(tipo), dados]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco('IHDR', ihdr), pedaco('IDAT', zlib.deflateSync(Buffer.from([0, 255, 255, 255]))), pedaco('IEND', Buffer.alloc(0))]);
}

test('planta de fundo: só imagens de verdade, só para quem tem acesso', async t => {
  const app = await servidorDeTeste(); t.after(() => app.close());
  const admin = cliente(app); await admin.entrar(ADMIN.email, ADMIN.senha);
  const casa = (await admin('GET', '/api/projetos')).json[0];
  const url = `/api/projetos/${casa.id}/referencias`;
  const png = pngMinimo();
  const ok = await admin('POST', url, png, { 'content-type': 'image/png', 'x-nome': encodeURIComponent('planta térrea.png') });
  assert.equal(ok.status, 200);
  const falso = await admin('POST', url, Buffer.from('<svg onload=alert(1)>'), { 'content-type': 'image/png' });
  assert.equal(falso.status, 415);
  const outro = await admin('POST', url, Buffer.from('oi'), { 'content-type': 'text/html' });
  assert.equal(outro.status, 415);
  const r = await app.inject({ url: `${url}/${ok.json.id}`, headers: { cookie: admin.cookie() } });
  assert.equal(r.statusCode, 200); assert.equal(r.headers['content-type'], 'image/png'); assert.deepEqual(r.rawPayload, png);
  assert.match(r.headers['content-security-policy'], /default-src 'none'/);
  const { cliente: estranho } = await novaPessoa(app, admin, 'estranho@exemplo.com');
  assert.equal((await estranho('GET', `${url}/${ok.json.id}`)).status, 404);
  const linhas = await admin('POST', url + '/linhas', { linhas: [[0, 0, 1000, 0], [0, 0, 0, 2000]] });
  assert.equal(linhas.status, 200);
  assert.equal((await admin('POST', url + '/linhas', { linhas: [[0, 0, 'x', 0]] })).status, 400);
});

test('Claude: desligado sem chave; com chave, respeita o limite por pessoa', async t => {
  const sem = await servidorDeTeste(); t.after(() => sem.close());
  const a = cliente(sem); await a.entrar(ADMIN.email, ADMIN.senha);
  const r0 = await a('POST', '/api/claude/json', { prompt: 'oi' });
  assert.equal(r0.status, 503); assert.equal(r0.json.codigo, 'sampling_disabled');

  const pedidos = [];
  const falso = {
    modelo: 'falso',
    async responderJson(prompt) { pedidos.push(prompt); return { largura_cm: 200 }; },
    async lerPlanta() {
      return { lote: { largura: 10, profundidade: 25 }, espessura: 0.15, observacoes: 'cotas legíveis',
        comodos: [{ nome: 'Sala', x: 2, y: 5, largura: 4, profundidade: 5, interno: true, azulejo: false }],
        aberturas: [{ tipo: 'porta', comodo: 0, lado: 'frente', distancia: 1, largura: 0.9, peitoril: 0, altura: 2.1 }] };
    },
  };
  const app = await servidorDeTeste({ CLAUDE_LIMITE_HORA: '2' }, { claude: falso }); t.after(() => app.close());
  const c = cliente(app); await c.entrar(ADMIN.email, ADMIN.senha);
  const r = await c('POST', '/api/claude/json', { prompt: 'medidas do sofá' });
  assert.equal(r.status, 200); assert.equal(r.json.resposta.largura_cm, 200);
  assert.equal(pedidos[0], 'medidas do sofá');
  assert.equal((await cliente(app)('POST', '/api/claude/json', { prompt: 'x' })).status, 401);
  // leitura da planta
  const casa = (await c('GET', '/api/projetos')).json[0];
  const ref = await c('POST', `/api/projetos/${casa.id}/referencias`, pngMinimo(), { 'content-type': 'image/png' });
  const lp = await c('POST', `/api/projetos/${casa.id}/ler-planta`, { referencia: ref.json.id });
  assert.equal(lp.status, 200);
  assert.equal(lp.json.planta.comodos[0].nome, 'Sala');
  assert.deepEqual(Planta.validarPlanta(lp.json.planta).erros, []);
  assert.equal(lp.json.observacoes, 'cotas legíveis');
  // terceiro pedido na mesma hora: limite (2)
  const lim = await c('POST', '/api/claude/json', { prompt: 'mais um' });
  assert.equal(lim.status, 429); assert.equal(lim.json.codigo, 'rate_limited');
});
