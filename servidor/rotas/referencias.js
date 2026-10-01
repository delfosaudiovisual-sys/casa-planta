// Fundo do editor de planta: a imagem da planta (PNG, JPEG ou WebP; PDF vira imagem no navegador) ou as linhas de um DXF.
const { agora, registrar } = require('../db');
const { exigirPapel } = require('../acesso');
const { erro, novoId, limparTexto } = require('../util');

const MAX_BYTES = 15 * 1024 * 1024, GUARDADAS = 10;
const ID_REF = /^[a-z0-9]{8,40}$/;

function tipoDaImagem(b) {
  if (b.length > 8 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

module.exports = async function (app) {
  const { db } = app;
  for (const t of ['image/png', 'image/jpeg', 'image/webp']) app.addContentTypeParser(t, { parseAs: 'buffer', bodyLimit: MAX_BYTES }, (req, corpo, feito) => feito(null, corpo));

  function guardar(req, projetoId, usuarioId, tipo, nome, dados) {
    const id = novoId(16);
    db.transaction(() => {
      db.prepare('INSERT INTO referencias (id, projeto_id, tipo, nome, dados, tamanho, criado_em, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, projetoId, tipo, nome, dados, dados.length, agora(), usuarioId);
      db.prepare(`DELETE FROM referencias WHERE projeto_id = ? AND id NOT IN (SELECT id FROM referencias WHERE projeto_id = ? ORDER BY criado_em DESC, rowid DESC LIMIT ${GUARDADAS})`).run(projetoId, projetoId);
    })();
    registrar(db, usuarioId, 'enviou-fundo', projetoId, nome);
    return id;
  }
  const nomeDoArquivo = req => { try { return limparTexto(decodeURIComponent(String(req.headers['x-nome'] || '')), 120); } catch { return ''; } };

  app.post('/api/projetos/:id/referencias', { bodyLimit: MAX_BYTES }, async (req) => {
    const { usuario } = exigirPapel(app, req, req.params.id, 'editor');
    if (!Buffer.isBuffer(req.body)) throw erro(415, 'Envie uma imagem PNG, JPEG ou WebP.');
    const tipo = tipoDaImagem(req.body);
    if (!tipo) throw erro(415, 'O arquivo não parece ser uma imagem PNG, JPEG ou WebP.');
    return { id: guardar(req, req.params.id, usuario.id, tipo, nomeDoArquivo(req), req.body), tipo: 'imagem' };
  });

  // DXF: o navegador lê o arquivo e manda só as linhas, já em metros: {linhas: [[x1,y1,x2,y2], ...]}
  app.post('/api/projetos/:id/referencias/linhas', {
    bodyLimit: MAX_BYTES,
    schema: { body: { type: 'object', required: ['linhas'], properties: { linhas: { type: 'array', maxItems: 300000 } } } },
  }, async (req) => {
    const { usuario } = exigirPapel(app, req, req.params.id, 'editor');
    const linhas = req.body.linhas;
    for (const l of linhas) if (!Array.isArray(l) || l.length !== 4 || !l.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e6)) throw erro(400, 'Linhas inválidas.');
    const dados = Buffer.from(JSON.stringify({ linhas: linhas.map(l => l.map(v => Math.round(v * 1000) / 1000)) }));
    return { id: guardar(req, req.params.id, usuario.id, 'application/json', nomeDoArquivo(req), dados), tipo: 'dxf' };
  });

  app.get('/api/projetos/:id/referencias/:rid', async (req, reply) => {
    exigirPapel(app, req, req.params.id);
    if (!ID_REF.test(req.params.rid)) throw erro(404, 'Arquivo não encontrado.');
    const r = db.prepare('SELECT tipo, dados FROM referencias WHERE id = ? AND projeto_id = ?').get(req.params.rid, req.params.id);
    if (!r) throw erro(404, 'Arquivo não encontrado.');
    reply.header('Cache-Control', 'private, max-age=604800, immutable').header('Content-Security-Policy', "default-src 'none'").type(r.tipo);
    return r.dados;
  });
};

module.exports.tipoDaImagem = tipoDaImagem;
module.exports.ID_REF = ID_REF;
