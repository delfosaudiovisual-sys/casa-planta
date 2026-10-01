// Sessões: um token aleatório no cookie (HttpOnly, SameSite=Lax, Secure em produção); no banco fica só o hash dele.
const { agora } = require('./db');
const { sha256, token, erro } = require('./util');

function nomeCookie(cfg) { return cfg.cookieSeguro ? '__Host-sessao' : 'sessao'; }

function opcoesCookie(cfg, maxAgeSeg) {
  return { path: '/', httpOnly: true, sameSite: 'lax', secure: cfg.cookieSeguro, maxAge: maxAgeSeg };
}

function criarSessao(app, reply, usuarioId, req) {
  const t = token(32), dias = app.cfg.sessaoDias, agoraMs = Date.now();
  app.db.prepare('INSERT INTO sessoes (id, usuario_id, criada_em, expira_em, visto_em, ip, agente) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(sha256(t), usuarioId, agora(), new Date(agoraMs + dias * 864e5).toISOString(), agora(), req.ip, String(req.headers['user-agent'] || '').slice(0, 200));
  reply.setCookie(nomeCookie(app.cfg), t, opcoesCookie(app.cfg, dias * 86400));
}

function encerrarSessao(app, req, reply) {
  const t = req.cookies[nomeCookie(app.cfg)];
  if (t) app.db.prepare('DELETE FROM sessoes WHERE id = ?').run(sha256(t));
  reply.clearCookie(nomeCookie(app.cfg), { path: '/', secure: app.cfg.cookieSeguro, sameSite: 'lax', httpOnly: true });
}

// Lê a sessão do pedido (se houver) e prolonga a validade no máximo uma vez por hora.
function lerSessao(app, req, reply) {
  const t = req.cookies[nomeCookie(app.cfg)];
  if (!t || t.length > 100) return null;
  const id = sha256(t);
  const s = app.db.prepare(`SELECT s.id, s.expira_em, s.visto_em, u.id AS uid, u.email, u.nome, u.admin, u.ativo
    FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = ?`).get(id);
  if (!s) return null;
  if (!s.ativo || s.expira_em < agora()) { app.db.prepare('DELETE FROM sessoes WHERE id = ?').run(id); return null; }
  if (Date.now() - Date.parse(s.visto_em) > 3600e3) {
    const dias = app.cfg.sessaoDias;
    app.db.prepare('UPDATE sessoes SET visto_em = ?, expira_em = ? WHERE id = ?').run(agora(), new Date(Date.now() + dias * 864e5).toISOString(), id);
    reply.setCookie(nomeCookie(app.cfg), t, opcoesCookie(app.cfg, dias * 86400));
  }
  return { id: s.uid, email: s.email, nome: s.nome, admin: !!s.admin, sessao: id };
}

function exigirUsuario(req) {
  if (!req.usuario) throw erro(401, 'Entre com o seu e-mail e senha.', 'session_expired');
  return req.usuario;
}
function exigirAdmin(req) {
  const u = exigirUsuario(req);
  if (!u.admin) throw erro(403, 'Só o administrador pode fazer isso.');
  return u;
}

module.exports = { nomeCookie, criarSessao, encerrarSessao, lerSessao, exigirUsuario, exigirAdmin };
