// Entrar, sair, dados da própria conta e aceitar convites (o link do convite também serve para trocar a senha esquecida).
const { agora, registrar } = require('../db');
const { gerarHash, conferirSenha, problemaNaSenha } = require('../senhas');
const { criarSessao, encerrarSessao, exigirUsuario } = require('../sessoes');
const { erro, sha256, limparTexto } = require('../util');

module.exports = async function (app) {
  const { db } = app;
  // depois de 5 senhas erradas para o mesmo e-mail, ele fica bloqueado por 15 minutos (além do limite por IP)
  const falhas = new Map();
  const BLOQUEIO_MS = 15 * 60e3;
  const bloqueado = email => { const f = falhas.get(email); return f && f.n >= 5 && Date.now() - f.t < BLOQUEIO_MS; };
  const anotarFalha = email => {
    const f = falhas.get(email), n = f && Date.now() - f.t < BLOQUEIO_MS ? f.n + 1 : 1;
    falhas.set(email, { n, t: Date.now() });
    if (falhas.size > 10000) falhas.clear();
  };
  const limiteEntrar = { rateLimit: { max: 10, timeWindow: '15 minutes', keyGenerator: req => req.ip } };

  app.post('/api/entrar', {
    config: limiteEntrar,
    schema: { body: { type: 'object', required: ['email', 'senha'], properties: { email: { type: 'string', maxLength: 200 }, senha: { type: 'string', maxLength: 200 } } } },
  }, async (req, reply) => {
    const email = req.body.email.trim().toLowerCase();
    if (bloqueado(email)) throw erro(429, 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.', 'rate_limited');
    const u = db.prepare('SELECT id, senha, ativo FROM usuarios WHERE email = ?').get(email);
    const ok = await conferirSenha(req.body.senha, u && u.ativo ? u.senha : null);
    if (!u || !u.ativo || !u.senha || !ok) {
      anotarFalha(email);
      registrar(db, u ? u.id : null, 'entrar-falhou', email);
      throw erro(401, 'E-mail ou senha incorretos.');
    }
    falhas.delete(email);
    criarSessao(app, reply, u.id, req);
    registrar(db, u.id, 'entrou', null, req.ip);
    return { ok: true };
  });

  app.post('/api/sair', async (req, reply) => { encerrarSessao(app, req, reply); return { ok: true }; });

  app.get('/api/eu', async (req, reply) => {
    const u = exigirUsuario(req);
    reply.header('Cache-Control', 'no-store');
    return { id: u.id, email: u.email, nome: u.nome, admin: u.admin, claude: !!app.claude, versao: app.cfg.versao };
  });

  app.patch('/api/eu', { schema: { body: { type: 'object', required: ['nome'], properties: { nome: { type: 'string', maxLength: 80 } } } } }, async (req) => {
    const u = exigirUsuario(req), nome = limparTexto(req.body.nome, 80);
    if (!nome) throw erro(400, 'Informe o seu nome.');
    db.prepare('UPDATE usuarios SET nome = ? WHERE id = ?').run(nome, u.id);
    return { ok: true };
  });

  app.post('/api/eu/senha', {
    config: limiteEntrar,
    schema: { body: { type: 'object', required: ['atual', 'nova'], properties: { atual: { type: 'string', maxLength: 200 }, nova: { type: 'string', maxLength: 200 } } } },
  }, async (req) => {
    const u = exigirUsuario(req);
    const linha = db.prepare('SELECT senha FROM usuarios WHERE id = ?').get(u.id);
    if (!(await conferirSenha(req.body.atual, linha.senha))) throw erro(400, 'A senha atual está errada.');
    const p = problemaNaSenha(req.body.nova, u.email); if (p) throw erro(400, p);
    db.prepare('UPDATE usuarios SET senha = ?, senha_em = ? WHERE id = ?').run(await gerarHash(req.body.nova), agora(), u.id);
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND id != ?').run(u.id, u.sessao);     // sai dos outros aparelhos
    registrar(db, u.id, 'trocou-senha');
    return { ok: true };
  });

  function lerConvite(t) {
    if (typeof t !== 'string' || t.length < 20 || t.length > 100) return null;
    const c = db.prepare(`SELECT c.id, c.tipo, c.expira_em, c.usado_em, u.id AS uid, u.email, u.nome, u.ativo
      FROM convites c JOIN usuarios u ON u.id = c.usuario_id WHERE c.id = ?`).get(sha256(t));
    if (!c || c.usado_em || c.expira_em < agora() || !c.ativo) return null;
    return c;
  }

  app.post('/api/convites/ver', { config: limiteEntrar, schema: { body: { type: 'object', required: ['token'], properties: { token: { type: 'string', maxLength: 100 } } } } }, async (req) => {
    const c = lerConvite(req.body.token);
    if (!c) throw erro(404, 'Este link não vale mais. Peça um link novo para quem cuida do sistema.');
    return { email: c.email, nome: c.nome, tipo: c.tipo };
  });

  app.post('/api/convites/aceitar', {
    config: limiteEntrar,
    schema: { body: { type: 'object', required: ['token', 'senha'], properties: { token: { type: 'string', maxLength: 100 }, senha: { type: 'string', maxLength: 200 }, nome: { type: 'string', maxLength: 80 } } } },
  }, async (req, reply) => {
    const c = lerConvite(req.body.token);
    if (!c) throw erro(404, 'Este link não vale mais. Peça um link novo para quem cuida do sistema.');
    const p = problemaNaSenha(req.body.senha, c.email); if (p) throw erro(400, p);
    const nome = limparTexto(req.body.nome, 80) || c.nome;
    const hash = await gerarHash(req.body.senha);
    db.transaction(() => {
      db.prepare('UPDATE convites SET usado_em = ? WHERE id = ?').run(agora(), c.id);
      db.prepare('UPDATE usuarios SET senha = ?, senha_em = ?, nome = ? WHERE id = ?').run(hash, agora(), nome, c.uid);
      db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(c.uid);
    })();
    registrar(db, c.uid, c.tipo === 'convite' ? 'aceitou-convite' : 'redefiniu-senha');
    criarSessao(app, reply, c.uid, req);
    return { ok: true };
  });
};

