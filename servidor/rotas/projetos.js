// Projetos (uma casa cada), quem tem acesso a eles, a planta (com as versões anteriores) e exportar/importar.
const fs = require('fs');
const path = require('path');
const Planta = require('../../compartilhado/planta');
const { agora, registrar } = require('../db');
const { exigirUsuario } = require('../sessoes');
const { exigirPapel, ORDEM } = require('../acesso');
const { limparItem, limparConfig, objetoSimples } = require('../validacao');
const { erro, novoId, ID_ITEM, emailValido, limparTexto } = require('../util');

const RAIZ = path.join(__dirname, '..', '..');
const MAX_ITENS = 3000, VERSOES_GUARDADAS = 40;
const CONFIG_PADRAO = { sunSide: 90, sunFine: 25, lat: -23.4, limite: 0, aberturas: {} };

function modeloCasa975() { return JSON.parse(fs.readFileSync(path.join(RAIZ, 'modelos', 'casa-975.json'), 'utf8')); }

function validarOuFalhar(planta) {
  const { planta: p, erros } = Planta.validarPlanta(planta);
  if (erros.length) throw erro(400, 'A planta tem problemas: ' + erros.slice(0, 5).join('; ') + (erros.length > 5 ? '…' : ''));
  return p;
}
// normaliza para salvar: descobre dobradiças de plantas antigas e gera folhas, pisos, forros e muros automáticos
function normalizar(planta) { const p = validarOuFalhar(planta); Planta.inferirFolhas(p); Planta.derivar(p); return validarOuFalhar(p); }

function criarProjeto(app, { nome, planta, config, itens = [] }, donoId) {
  const id = novoId(), t = agora();
  if (itens.length > MAX_ITENS) throw erro(400, `No máximo ${MAX_ITENS} itens por projeto.`);
  const limpos = itens.map(it => {
    const iid = typeof it.id === 'string' && ID_ITEM.test(it.id) ? it.id : novoId(20);
    return [iid, limparItem(it)];
  });
  app.db.transaction(() => {
    app.db.prepare('INSERT INTO projetos (id, nome, planta, config, planta_versao, criado_por, criado_em, atualizado_em) VALUES (?, ?, ?, ?, 1, ?, ?, ?)')
      .run(id, nome, JSON.stringify(planta), JSON.stringify(limparConfig({ ...CONFIG_PADRAO, ...(config || {}) })), donoId, t, t);
    app.db.prepare('INSERT INTO membros (projeto_id, usuario_id, papel) VALUES (?, ?, ?)').run(id, donoId, 'dono');
    const ins = app.db.prepare('INSERT OR REPLACE INTO itens (projeto_id, id, dados, atualizado_em, atualizado_por) VALUES (?, ?, ?, ?, ?)');
    for (const [iid, dados] of limpos) ins.run(id, iid, JSON.stringify(dados), t, donoId);
  })();
  return id;
}

function exportar(db, id) {
  const p = db.prepare('SELECT nome, planta, config FROM projetos WHERE id = ?').get(id);
  const itens = db.prepare('SELECT id, dados FROM itens WHERE projeto_id = ? ORDER BY id').all(id).map(r => ({ id: r.id, ...JSON.parse(r.dados) }));
  return { formato: 'casa-planta', versao: 1, exportado_em: agora(), nome: p.nome, planta: JSON.parse(p.planta), config: JSON.parse(p.config), itens };
}

module.exports = async function (app) {
  const { db, hub } = app;

  app.get('/api/projetos', async (req, reply) => {
    const u = exigirUsuario(req);
    reply.header('Cache-Control', 'no-store');
    return db.prepare(`SELECT p.id, p.nome, p.atualizado_em, m.papel,
      (SELECT COUNT(*) FROM itens i WHERE i.projeto_id = p.id) AS itens,
      (SELECT COUNT(*) FROM membros mm WHERE mm.projeto_id = p.id) AS pessoas,
      json_extract(p.planta, '$.lote.largura') AS largura, json_extract(p.planta, '$.lote.profundidade') AS profundidade
      FROM projetos p JOIN membros m ON m.projeto_id = p.id AND m.usuario_id = ? ORDER BY p.atualizado_em DESC`).all(u.id);
  });

  app.post('/api/projetos', {
    bodyLimit: 12 * 1024 * 1024,
    schema: { body: { type: 'object', required: ['nome', 'modelo'], properties: {
      nome: { type: 'string', maxLength: 80 }, modelo: { type: 'string', enum: ['em-branco', 'casa-975', 'arquivo'] },
      largura: { type: 'number' }, profundidade: { type: 'number' }, arquivo: { type: 'object' },
    } } },
  }, async (req) => {
    const u = exigirUsuario(req);
    const nome = limparTexto(req.body.nome, 80) || 'Nova casa';
    let dados;
    if (req.body.modelo === 'casa-975') dados = { planta: validarOuFalhar(modeloCasa975()) };
    else if (req.body.modelo === 'arquivo') {
      const a = req.body.arquivo || {};
      if (a.formato !== 'casa-planta') throw erro(400, 'Esse arquivo não é uma cópia de projeto deste programa.');
      objetoSimples(a.planta, 'planta');
      dados = { planta: validarOuFalhar(a.planta), config: a.config && typeof a.config === 'object' ? a.config : {}, itens: Array.isArray(a.itens) ? a.itens : [] };
    } else {
      const { largura = 10, profundidade = 25 } = req.body;
      if (!(largura >= 2 && largura <= 200 && profundidade >= 2 && profundidade <= 300)) throw erro(400, 'Medidas do terreno inválidas.');
      dados = { planta: validarOuFalhar(Planta.plantaEmBranco({ nome, largura, profundidade })) };
    }
    const id = criarProjeto(app, { nome, ...dados }, u.id);
    registrar(db, u.id, 'criou-projeto', id, req.body.modelo);
    return { id };
  });

  app.get('/api/projetos/:id', async (req, reply) => {
    const { papel } = exigirPapel(app, req, req.params.id);
    const p = db.prepare('SELECT id, nome, planta, config, planta_versao, atualizado_em FROM projetos WHERE id = ?').get(req.params.id);
    reply.header('Cache-Control', 'no-store');
    return { id: p.id, nome: p.nome, papel, planta: JSON.parse(p.planta), config: JSON.parse(p.config), plantaVersao: p.planta_versao, atualizado_em: p.atualizado_em };
  });

  app.patch('/api/projetos/:id', { schema: { body: { type: 'object', required: ['nome'], properties: { nome: { type: 'string', maxLength: 80 } } } } }, async (req) => {
    const { usuario } = exigirPapel(app, req, req.params.id, 'editor');
    const nome = limparTexto(req.body.nome, 80);
    if (!nome) throw erro(400, 'Informe o nome do projeto.');
    db.prepare('UPDATE projetos SET nome = ?, atualizado_em = ? WHERE id = ?').run(nome, agora(), req.params.id);
    registrar(db, usuario.id, 'renomeou-projeto', req.params.id, nome);
    return { ok: true };
  });

  app.delete('/api/projetos/:id', { schema: { body: { type: 'object', required: ['confirmar'], properties: { confirmar: { type: 'string', maxLength: 80 } } } } }, async (req) => {
    const { usuario } = exigirPapel(app, req, req.params.id, 'dono');
    const p = db.prepare('SELECT nome FROM projetos WHERE id = ?').get(req.params.id);
    if (req.body.confirmar.trim() !== p.nome) throw erro(400, 'Para apagar, escreva o nome do projeto exatamente como está.');
    db.prepare('DELETE FROM projetos WHERE id = ?').run(req.params.id);
    hub.fecharProjeto(req.params.id);
    registrar(db, usuario.id, 'apagou-projeto', req.params.id, p.nome);
    return { ok: true };
  });

  app.post('/api/projetos/:id/duplicar', async (req) => {
    const { usuario } = exigirPapel(app, req, req.params.id);
    const e = exportar(db, req.params.id);
    const id = criarProjeto(app, { nome: (e.nome + ' (cópia)').slice(0, 80), planta: e.planta, config: e.config, itens: e.itens }, usuario.id);
    registrar(db, usuario.id, 'duplicou-projeto', id, req.params.id);
    return { id };
  });

  app.get('/api/projetos/:id/exportar', async (req, reply) => {
    exigirPapel(app, req, req.params.id);
    const e = exportar(db, req.params.id);
    const arquivo = (e.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'projeto') + '.json';
    reply.header('Content-Disposition', `attachment; filename="${arquivo}"`).header('Cache-Control', 'no-store').type('application/json');
    return JSON.stringify(e, null, 1);
  });

  // ------------------------------------------------------------------ planta
  app.put('/api/projetos/:id/planta', {
    bodyLimit: 4 * 1024 * 1024,
    schema: { body: { type: 'object', required: ['planta', 'versao'], properties: { planta: { type: 'object' }, versao: { type: 'integer' } } } },
  }, async (req) => {
    const { usuario } = exigirPapel(app, req, req.params.id, 'editor');
    const p = db.prepare('SELECT planta, planta_versao FROM projetos WHERE id = ?').get(req.params.id);
    if (req.body.versao !== p.planta_versao) throw erro(409, 'Outra pessoa salvou a planta enquanto você editava. Recarregue para ver a versão mais nova.', 'conflito');
    const nova = normalizar(req.body.planta), versao = p.planta_versao + 1;
    db.transaction(() => {
      db.prepare('INSERT INTO plantas_antigas (projeto_id, versao, planta, criado_em, criado_por) VALUES (?, ?, ?, ?, ?)').run(req.params.id, p.planta_versao, p.planta, agora(), usuario.id);
      db.prepare(`DELETE FROM plantas_antigas WHERE projeto_id = ? AND id NOT IN (SELECT id FROM plantas_antigas WHERE projeto_id = ? ORDER BY versao DESC LIMIT ${VERSOES_GUARDADAS})`).run(req.params.id, req.params.id);
      db.prepare('UPDATE projetos SET planta = ?, planta_versao = ?, atualizado_em = ? WHERE id = ?').run(JSON.stringify(nova), versao, agora(), req.params.id);
      // portas e janelas mudaram de lugar: os ajustes feitos no 3D (config.aberturas) não valem mais
      const cfg = JSON.parse(db.prepare('SELECT config FROM projetos WHERE id = ?').get(req.params.id).config);
      if (cfg.aberturas && Object.keys(cfg.aberturas).length) {
        cfg.aberturas = {};
        db.prepare('UPDATE projetos SET config = ? WHERE id = ?').run(JSON.stringify(cfg), req.params.id);
        hub.emitir(req.params.id, 'config', cfg);
      }
    })();
    hub.emitir(req.params.id, 'planta', { versao });
    registrar(db, usuario.id, 'salvou-planta', req.params.id, versao);
    return { versao, planta: nova };
  });

  app.get('/api/projetos/:id/plantas', async (req) => {
    exigirPapel(app, req, req.params.id, 'editor');
    return db.prepare(`SELECT a.id, a.versao, a.criado_em, u.nome AS por FROM plantas_antigas a LEFT JOIN usuarios u ON u.id = a.criado_por
      WHERE a.projeto_id = ? ORDER BY a.versao DESC`).all(req.params.id);
  });

  app.get('/api/projetos/:id/plantas/:vid', async (req) => {
    exigirPapel(app, req, req.params.id, 'editor');
    const a = db.prepare('SELECT versao, planta FROM plantas_antigas WHERE id = ? AND projeto_id = ?').get(Number(req.params.vid), req.params.id);
    if (!a) throw erro(404, 'Versão não encontrada.');
    return { versao: a.versao, planta: JSON.parse(a.planta) };
  });

  // ------------------------------------------------------------------ pessoas com acesso
  app.get('/api/projetos/:id/membros', async (req) => {
    exigirPapel(app, req, req.params.id);
    return db.prepare(`SELECT u.id, u.nome, u.email, m.papel FROM membros m JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.projeto_id = ? ORDER BY CASE m.papel WHEN 'dono' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, u.nome COLLATE NOCASE`).all(req.params.id);
  });

  const papelSchema = { type: 'string', enum: Object.keys(ORDEM) };
  app.post('/api/projetos/:id/membros', { schema: { body: { type: 'object', required: ['email', 'papel'], properties: { email: { type: 'string', maxLength: 200 }, papel: papelSchema } } } }, async (req) => {
    const { usuario } = exigirPapel(app, req, req.params.id, 'dono');
    const email = req.body.email.trim().toLowerCase();
    if (!emailValido(email)) throw erro(400, 'E-mail inválido.');
    const alvo = db.prepare('SELECT id, ativo FROM usuarios WHERE email = ?').get(email);
    if (!alvo || !alvo.ativo) throw erro(404, 'Essa pessoa ainda não tem acesso ao sistema. Peça ao administrador para convidá-la primeiro.');
    db.prepare('INSERT INTO membros (projeto_id, usuario_id, papel) VALUES (?, ?, ?) ON CONFLICT (projeto_id, usuario_id) DO UPDATE SET papel = excluded.papel')
      .run(req.params.id, alvo.id, req.body.papel);
    registrar(db, usuario.id, 'compartilhou', req.params.id, `${email} ${req.body.papel}`);
    return { ok: true };
  });

  function sobraDono(projetoId, saindo) {
    return db.prepare("SELECT COUNT(*) AS n FROM membros WHERE projeto_id = ? AND papel = 'dono' AND usuario_id != ?").get(projetoId, saindo).n > 0;
  }

  app.patch('/api/projetos/:id/membros/:uid', { schema: { body: { type: 'object', required: ['papel'], properties: { papel: papelSchema } } } }, async (req) => {
    const { usuario } = exigirPapel(app, req, req.params.id, 'dono');
    const uid = Number(req.params.uid);
    const m = db.prepare('SELECT papel FROM membros WHERE projeto_id = ? AND usuario_id = ?').get(req.params.id, uid);
    if (!m) throw erro(404, 'Essa pessoa não tem acesso a este projeto.');
    if (m.papel === 'dono' && req.body.papel !== 'dono' && !sobraDono(req.params.id, uid)) throw erro(400, 'O projeto precisa de pelo menos um dono.');
    db.prepare('UPDATE membros SET papel = ? WHERE projeto_id = ? AND usuario_id = ?').run(req.body.papel, req.params.id, uid);
    hub.expulsar(req.params.id, uid);           // a página dela recarrega com o papel novo
    registrar(db, usuario.id, 'mudou-papel', req.params.id, `${uid} ${req.body.papel}`);
    return { ok: true };
  });

  app.delete('/api/projetos/:id/membros/:uid', async (req) => {
    const uid = Number(req.params.uid), eu = exigirUsuario(req);
    exigirPapel(app, req, req.params.id, eu.id === uid ? 'leitor' : 'dono');      // qualquer um pode sair; só o dono tira os outros
    const m = db.prepare('SELECT papel FROM membros WHERE projeto_id = ? AND usuario_id = ?').get(req.params.id, uid);
    if (!m) throw erro(404, 'Essa pessoa não tem acesso a este projeto.');
    if (m.papel === 'dono' && !sobraDono(req.params.id, uid)) throw erro(400, 'O projeto precisa de pelo menos um dono. Passe a posse para outra pessoa antes de sair.');
    db.prepare('DELETE FROM membros WHERE projeto_id = ? AND usuario_id = ?').run(req.params.id, uid);
    hub.expulsar(req.params.id, uid);
    registrar(db, eu.id, 'tirou-acesso', req.params.id, uid);
    return { ok: true };
  });
};

module.exports.criarProjeto = criarProjeto;
module.exports.modeloCasa975 = modeloCasa975;
module.exports.validarOuFalhar = validarOuFalhar;
module.exports.CONFIG_PADRAO = CONFIG_PADRAO;
