// Móveis (itens) e ajustes (config) de um projeto, e o canal de tempo real que avisa as outras páginas abertas.
// O formato imita o banco do artefato do claude.ai, que a página 3D já usava: set (troca o item), update (muda campos), delete.
const { agora } = require('../db');
const { exigirPapel } = require('../acesso');
const { limparItem, limparConfig } = require('../validacao');
const { erro, ID_ITEM, novoId } = require('../util');

const MAX_ITENS = 3000;

module.exports = async function (app) {
  const { db, hub } = app;
  const lerItens = id => db.prepare('SELECT id, dados FROM itens WHERE projeto_id = ? ORDER BY id').all(id).map(r => ({ id: r.id, ...JSON.parse(r.dados) }));
  const tocar = id => db.prepare('UPDATE projetos SET atualizado_em = ? WHERE id = ?').run(agora(), id);
  const idItem = v => { if (!ID_ITEM.test(v)) throw erro(400, 'Identificador de item inválido.'); return v; };

  app.get('/api/projetos/:id/itens', async (req, reply) => {
    exigirPapel(app, req, req.params.id);
    reply.header('Cache-Control', 'no-store');
    return lerItens(req.params.id);
  });

  app.put('/api/projetos/:id/itens/:item', async (req) => {
    const { usuario } = exigirPapel(app, req, req.params.id, 'editor');
    const iid = idItem(req.params.item), dados = limparItem(req.body);
    const existe = db.prepare('SELECT 1 FROM itens WHERE projeto_id = ? AND id = ?').get(req.params.id, iid);
    if (!existe && db.prepare('SELECT COUNT(*) AS n FROM itens WHERE projeto_id = ?').get(req.params.id).n >= MAX_ITENS) throw erro(400, 'Limite de itens atingido.', 'quota_exceeded');
    db.prepare('INSERT OR REPLACE INTO itens (projeto_id, id, dados, atualizado_em, atualizado_por) VALUES (?, ?, ?, ?, ?)').run(req.params.id, iid, JSON.stringify(dados), agora(), usuario.id);
    tocar(req.params.id);
    hub.emitir(req.params.id, 'item', { id: iid, dados });
    return { id: iid, dados };
  });

  app.patch('/api/projetos/:id/itens/:item', async (req) => {
    const { usuario } = exigirPapel(app, req, req.params.id, 'editor');
    const iid = idItem(req.params.item), parte = limparItem(req.body, true);
    const linha = db.prepare('SELECT dados FROM itens WHERE projeto_id = ? AND id = ?').get(req.params.id, iid);
    if (!linha) throw erro(404, 'Esse item não existe mais (talvez alguém tenha excluído).');
    const dados = limparItem({ ...JSON.parse(linha.dados), ...parte });
    db.prepare('UPDATE itens SET dados = ?, atualizado_em = ?, atualizado_por = ? WHERE projeto_id = ? AND id = ?').run(JSON.stringify(dados), agora(), usuario.id, req.params.id, iid);
    tocar(req.params.id);
    hub.emitir(req.params.id, 'item', { id: iid, dados });
    return { id: iid, dados };
  });

  app.delete('/api/projetos/:id/itens/:item', async (req) => {
    exigirPapel(app, req, req.params.id, 'editor');
    const iid = idItem(req.params.item);
    db.prepare('DELETE FROM itens WHERE projeto_id = ? AND id = ?').run(req.params.id, iid);
    tocar(req.params.id);
    hub.emitir(req.params.id, 'item', { id: iid, apagado: true });
    return { ok: true };
  });

  // trazer itens de outro lugar (ex.: a exportação dados/itens.json do artefato do claude.ai)
  app.post('/api/projetos/:id/itens/importar', {
    bodyLimit: 12 * 1024 * 1024,
    schema: { body: { type: 'object', required: ['itens'], properties: { itens: { type: 'array', maxItems: MAX_ITENS }, substituir: { type: 'boolean' } } } },
  }, async (req) => {
    const { usuario } = exigirPapel(app, req, req.params.id, 'editor');
    const limpos = req.body.itens.map(it => [typeof it?.id === 'string' && ID_ITEM.test(it.id) ? it.id : novoId(20), limparItem(it)]);
    const t = agora();
    db.transaction(() => {
      if (req.body.substituir) db.prepare('DELETE FROM itens WHERE projeto_id = ?').run(req.params.id);
      const ins = db.prepare('INSERT OR REPLACE INTO itens (projeto_id, id, dados, atualizado_em, atualizado_por) VALUES (?, ?, ?, ?, ?)');
      for (const [iid, dados] of limpos) ins.run(req.params.id, iid, JSON.stringify(dados), t, usuario.id);
      if (db.prepare('SELECT COUNT(*) AS n FROM itens WHERE projeto_id = ?').get(req.params.id).n > MAX_ITENS) throw erro(400, 'Limite de itens atingido.', 'quota_exceeded');
    })();
    tocar(req.params.id);
    hub.emitir(req.params.id, 'itens', lerItens(req.params.id));
    return { importados: limpos.length };
  });

  app.get('/api/projetos/:id/config', async (req) => {
    exigirPapel(app, req, req.params.id);
    return JSON.parse(db.prepare('SELECT config FROM projetos WHERE id = ?').get(req.params.id).config);
  });

  app.put('/api/projetos/:id/config', async (req) => {
    exigirPapel(app, req, req.params.id, 'editor');
    const cfg = limparConfig(req.body);
    db.prepare('UPDATE projetos SET config = ?, atualizado_em = ? WHERE id = ?').run(JSON.stringify(cfg), agora(), req.params.id);
    hub.emitir(req.params.id, 'config', cfg);
    return cfg;
  });

  // tempo real: a lista inteira ao conectar, depois só o que mudar
  app.get('/api/projetos/:id/eventos', async (req, reply) => {
    const { usuario } = exigirPapel(app, req, req.params.id);
    if (!hub.podeEntrar(usuario.id)) throw erro(429, 'Páginas abertas demais. Feche algumas abas.');
    const p = db.prepare('SELECT config, planta_versao FROM projetos WHERE id = ?').get(req.params.id);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff',
    });
    reply.raw.write('retry: 3000\n\n');
    const c = hub.entrar(req.params.id, usuario.id, reply.raw);
    hub.enviar(c, 'itens', lerItens(req.params.id));
    hub.enviar(c, 'config', JSON.parse(p.config));
    hub.enviar(c, 'planta', { versao: p.planta_versao });
  });
};
