// Comandos de manutenção, para quem tem acesso ao terminal do servidor:
//   npm run convidar -- pessoa@email.com [--admin] [--nome "Nome"]   cria a pessoa e mostra o link do convite
//   npm run convidar -- pessoa@email.com --link                       novo link (convite ou troca de senha) para quem já existe
const { lerConfig } = require('./config');
const { abrirBanco, agora, registrar } = require('./db');
const { sha256, token, emailValido } = require('./util');
const path = require('path');

const args = process.argv.slice(2);
const email = (args.find(a => !a.startsWith('--')) || '').toLowerCase();
const nomeIdx = args.indexOf('--nome');
if (!emailValido(email)) { console.error('uso: npm run convidar -- pessoa@email.com [--admin] [--nome "Nome"] [--link]'); process.exit(2); }

const cfg = lerConfig();
const db = abrirBanco(path.join(cfg.dataDir, 'casa.db'));
let u = db.prepare('SELECT id, senha FROM usuarios WHERE email = ?').get(email);
if (!u) {
  if (args.includes('--link')) { console.error('Essa pessoa não existe. Rode sem --link para convidar.'); process.exit(1); }
  const nome = nomeIdx >= 0 ? args[nomeIdx + 1] : email.split('@')[0];
  const r = db.prepare('INSERT INTO usuarios (email, nome, admin, ativo, criado_em) VALUES (?, ?, ?, 1, ?)').run(email, nome, args.includes('--admin') ? 1 : 0, agora());
  u = { id: Number(r.lastInsertRowid), senha: null };
  registrar(db, null, 'convidou (terminal)', email);
}
const t = token(32);
db.prepare('UPDATE convites SET usado_em = ? WHERE usuario_id = ? AND usado_em IS NULL').run(agora(), u.id);
db.prepare('INSERT INTO convites (id, tipo, usuario_id, criado_por, criado_em, expira_em) VALUES (?, ?, ?, NULL, ?, ?)')
  .run(sha256(t), u.senha ? 'senha' : 'convite', u.id, agora(), new Date(Date.now() + 7 * 864e5).toISOString());
const base = cfg.urlPublica || `http://localhost:${cfg.porta}`;
console.log(`Link (vale 7 dias, uma vez só):\n${base}/convite#${t}`);
db.close();
