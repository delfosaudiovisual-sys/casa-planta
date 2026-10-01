// Monta um servidor de teste (banco em memória, sem porta) e um "navegador" simples com cookie.
const os = require('os');
const fs = require('fs');
const path = require('path');
const { lerConfig } = require('../servidor/config');
const { criarApp } = require('../servidor/app');
const { semear } = require('../servidor/semente');
const { abrirBanco } = require('../servidor/db');

const ADMIN = { email: 'admin@exemplo.com', senha: 'senha-de-teste-123' };

async function servidorDeTeste(extra = {}, opcoes = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'casa-teste-'));
  const cfg = lerConfig({ NODE_ENV: 'test', DATA_DIR: dataDir, ADMIN_EMAIL: ADMIN.email, ADMIN_SENHA_INICIAL: ADMIN.senha, ...extra });
  const app = await criarApp(cfg, { db: abrirBanco(':memory:'), claude: null, ...opcoes });
  await semear(app);
  app.addHook('onClose', async () => { app.db.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return app;
}

// cliente com cookie de sessão; por padrão manda os cabeçalhos que um navegador manda num pedido do próprio site
function cliente(app) {
  let cookie = '';
  const c = async (metodo, url, corpo, cab = {}) => {
    const headers = { 'sec-fetch-site': 'same-origin', ...cab };
    if (cookie) headers.cookie = cookie;
    const r = await app.inject({ method: metodo, url, payload: corpo, headers });
    const sc = r.headers['set-cookie'];
    if (sc) { const v = (Array.isArray(sc) ? sc : [sc]).find(x => /^(__Host-)?sessao=/.test(x)); if (v) cookie = v.split(';')[0].endsWith('=') ? '' : v.split(';')[0]; }
    let json = null; try { json = r.json(); } catch { /* não é json */ }
    return { status: r.statusCode, json, corpo: r.body, headers: r.headers };
  };
  c.entrar = async (email, senha) => { const r = await c('POST', '/api/entrar', { email, senha }); if (r.status !== 200) throw new Error('não entrou: ' + r.corpo); return r; };
  c.cookie = () => cookie;
  return c;
}

// convida uma pessoa (como admin) e aceita o convite; devolve o cliente já logado
async function novaPessoa(app, admin, email, senha = 'senha-da-pessoa-789') {
  const r = await admin('POST', '/api/usuarios', { email, nome: email.split('@')[0] });
  if (r.status !== 200) throw new Error(r.corpo);
  const token = r.json.link.split('#')[1];
  const p = cliente(app);
  const a = await p('POST', '/api/convites/aceitar', { token, senha });
  if (a.status !== 200) throw new Error(a.corpo);
  return { cliente: p, id: r.json.id, token };
}

module.exports = { servidorDeTeste, cliente, novaPessoa, ADMIN };
