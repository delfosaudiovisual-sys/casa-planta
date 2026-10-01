// Funções com o Claude: medidas e preços (página 3D) e leitura da imagem da planta (editor).
// Limites: por pessoa por hora (memória) e por dia para todo mundo (banco), para a conta da API não ter surpresas.
const Planta = require('../../compartilhado/planta');
const { exigirUsuario } = require('../sessoes');
const { exigirPapel } = require('../acesso');
const { erro } = require('../util');
const { ID_REF } = require('./referencias');

module.exports = async function (app) {
  const { db, cfg } = app;
  const porHora = new Map();          // usuarioId -> [horários dos pedidos]

  function cota(usuarioId) {
    if (!app.claude) throw erro(503, 'O Claude não está ligado neste servidor.', 'sampling_disabled');
    const agoraMs = Date.now(), lista = (porHora.get(usuarioId) || []).filter(t => agoraMs - t < 3600e3);
    if (lista.length >= cfg.claudeLimiteHora) throw erro(429, 'Você já fez muitos pedidos ao Claude nesta hora. Tente mais tarde.', 'rate_limited');
    const dia = new Date().toISOString().slice(0, 10);
    const hoje = db.prepare('SELECT COALESCE(SUM(pedidos), 0) AS n FROM uso_claude WHERE dia = ?').get(dia).n;
    if (hoje >= cfg.claudeLimiteDia) throw erro(429, 'O limite de pedidos ao Claude de hoje acabou. Amanhã volta.', 'rate_limited');
    lista.push(agoraMs); porHora.set(usuarioId, lista);
    db.prepare('INSERT INTO uso_claude (dia, usuario_id, pedidos) VALUES (?, ?, 1) ON CONFLICT (dia, usuario_id) DO UPDATE SET pedidos = pedidos + 1').run(dia, usuarioId);
  }
  // se a pessoa fechar a página (ou clicar em Parar), o pedido ao Claude também para
  function cancelavel(req, reply) {
    const ctl = new AbortController();
    reply.raw.on('close', () => { if (!reply.raw.writableFinished) ctl.abort(); });
    return ctl.signal;
  }

  app.post('/api/claude/json', {
    schema: { body: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string', minLength: 1, maxLength: 30000 } } } },
  }, async (req, reply) => {
    const u = exigirUsuario(req);
    cota(u.id);
    return { resposta: await app.claude.responderJson(req.body.prompt, { signal: cancelavel(req, reply) }) };
  });

  app.post('/api/projetos/:id/ler-planta', {
    schema: { body: { type: 'object', required: ['referencia'], properties: { referencia: { type: 'string', maxLength: 40 }, observacao: { type: 'string', maxLength: 1000 } } } },
  }, async (req, reply) => {
    const { usuario } = exigirPapel(app, req, req.params.id, 'editor');
    if (!ID_REF.test(req.body.referencia)) throw erro(404, 'Imagem não encontrada.');
    const r = db.prepare('SELECT tipo, dados FROM referencias WHERE id = ? AND projeto_id = ?').get(req.body.referencia, req.params.id);
    if (!r) throw erro(404, 'Imagem não encontrada.');
    if (!r.tipo.startsWith('image/')) throw erro(400, 'O Claude lê imagens e PDFs. Para DXF, desenhe as paredes por cima das linhas.');
    if (r.dados.length > 5 * 1024 * 1024) throw erro(400, 'A imagem é grande demais para o Claude (máximo 5 MB). Envie de novo, que o editor reduz o tamanho.');
    cota(usuario.id);
    const atual = JSON.parse(db.prepare('SELECT planta FROM projetos WHERE id = ?').get(req.params.id).planta);
    const leitura = await app.claude.lerPlanta({ imagem: r.dados, tipo: r.tipo, observacao: req.body.observacao || '', lote: null }, { signal: cancelavel(req, reply) });
    const rascunho = Planta.plantaDaLeitura(leitura, atual);
    const { planta, erros } = Planta.validarPlanta(rascunho);
    if (!planta.comodos.length) throw erro(422, 'Não consegui reconhecer os cômodos nessa imagem. Tente uma imagem mais nítida ou desenhe à mão.', 'invalid_json');
    return { planta, observacoes: String(leitura.observacoes || '').slice(0, 1000), avisos: erros };
  });
};
