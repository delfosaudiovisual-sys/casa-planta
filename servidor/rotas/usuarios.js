// Administração das pessoas: convidar, gerar link de nova senha, tornar administrador, desativar.
// Não existe cadastro aberto: só entra quem recebeu um convite.
const { agora, registrar } = require('../db');
const { exigirAdmin } = require('../sessoes');
const { erro, sha256, token, emailValido, limparTexto } = require('../util');

const VALIDADE_DIAS = 7;

function urlBase(app, req) { return app.cfg.urlPublica || `${req.protocol}://${req.host}`; }

function criarLink(app, req, usuarioId, tipo, criadoPor) {
  const t = token(32);
  app.db.prepare('UPDATE convites SET usado_em = ? WHERE usuario_id = ? AND usado_em IS NULL').run(agora(), usuarioId);   // vale só o último
  app.db.prepare('INSERT INTO convites (id, tipo, usuario_id, criado_por, criado_em, expira_em) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sha256(t), tipo, usuarioId, criadoPor, agora(), new Date(Date.now() + VALIDADE_DIAS * 864e5).toISOString());
  // o token vai depois do #: o navegador não manda essa parte para o servidor, então ela não aparece em registros de acesso
  return { link: `${urlBase(app, req)}/convite#${t}`, validoAte: new Date(Date.now() + VALIDADE_DIAS * 864e5).toISOString() };
}

module.exports = async function (app) {
  const { db } = app;

  app.get('/api/usuarios', async (req) => {
    exigirAdmin(req);
    return db.prepare(`SELECT u.id, u.email, u.nome, u.admin, u.ativo, u.criado_em, u.senha IS NULL AS pendente,
      (SELECT COUNT(*) FROM membros m WHERE m.usuario_id = u.id) AS projetos,
      (SELECT MAX(visto_em) FROM sessoes s WHERE s.usuario_id = u.id) AS visto_em
      FROM usuarios u ORDER BY u.ativo DESC, u.nome COLLATE NOCASE`).all()
      .map(u => ({ ...u, admin: !!u.admin, ativo: !!u.ativo, pendente: !!u.pendente }));
  });

  app.post('/api/usuarios', {
    schema: { body: { type: 'object', required: ['email'], properties: { email: { type: 'string', maxLength: 200 }, nome: { type: 'string', maxLength: 80 }, admin: { type: 'boolean' } } } },
  }, async (req) => {
    const eu = exigirAdmin(req);
    const email = req.body.email.trim().toLowerCase();
    if (!emailValido(email)) throw erro(400, 'E-mail inválido.');
    if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) throw erro(409, 'Já existe uma pessoa com esse e-mail.');
    const nome = limparTexto(req.body.nome, 80) || email.split('@')[0];
    const { lastInsertRowid: id } = db.prepare('INSERT INTO usuarios (email, nome, admin, ativo, criado_em) VALUES (?, ?, ?, 1, ?)')
      .run(email, nome, req.body.admin ? 1 : 0, agora());
    registrar(db, eu.id, 'convidou', email);
    return { id: Number(id), ...criarLink(app, req, Number(id), 'convite', eu.id) };
  });

  app.post('/api/usuarios/:id/link', async (req) => {
    const eu = exigirAdmin(req);
    const u = db.prepare('SELECT id, email, senha, ativo FROM usuarios WHERE id = ?').get(Number(req.params.id));
    if (!u) throw erro(404, 'Pessoa não encontrada.');
    if (!u.ativo) throw erro(400, 'Reative a pessoa antes de gerar um link.');
    registrar(db, eu.id, 'gerou-link', u.email);
    return criarLink(app, req, u.id, u.senha ? 'senha' : 'convite', eu.id);
  });

  app.patch('/api/usuarios/:id', {
    schema: { body: { type: 'object', properties: { nome: { type: 'string', maxLength: 80 }, admin: { type: 'boolean' }, ativo: { type: 'boolean' } } } },
  }, async (req) => {
    const eu = exigirAdmin(req);
    const id = Number(req.params.id);
    const u = db.prepare('SELECT id, email, admin, ativo FROM usuarios WHERE id = ?').get(id);
    if (!u) throw erro(404, 'Pessoa não encontrada.');
    const { nome, admin, ativo } = req.body;
    if (id === eu.id && (admin === false || ativo === false)) throw erro(400, 'Você não pode tirar o seu próprio acesso de administrador.');
    if ((admin === false || ativo === false) && u.admin) {
      const outros = db.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE admin = 1 AND ativo = 1 AND id != ?').get(id).n;
      if (!outros) throw erro(400, 'Precisa sobrar pelo menos um administrador.');
    }
    db.transaction(() => {
      if (nome !== undefined) { const n = limparTexto(nome, 80); if (n) db.prepare('UPDATE usuarios SET nome = ? WHERE id = ?').run(n, id); }
      if (admin !== undefined) db.prepare('UPDATE usuarios SET admin = ? WHERE id = ?').run(admin ? 1 : 0, id);
      if (ativo !== undefined) {
        db.prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run(ativo ? 1 : 0, id);
        if (!ativo) { db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(id); db.prepare('UPDATE convites SET usado_em = ? WHERE usuario_id = ? AND usado_em IS NULL').run(agora(), id); }
      }
    })();
    if (ativo === false) app.hub.expulsarDeTudo(id);
    registrar(db, eu.id, 'alterou-pessoa', u.email, JSON.stringify(req.body));
    return { ok: true };
  });
};

module.exports.criarLink = criarLink;
