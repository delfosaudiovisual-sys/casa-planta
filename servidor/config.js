// Configuração lida das variáveis de ambiente (veja docs/IMPLANTAR.md e .env.exemplo).
const path = require('path');
const pacote = require('../package.json');

const RAIZ = path.join(__dirname, '..');

function lerConfig(env = process.env) {
  const producao = env.NODE_ENV === 'production';
  const num = (v, padrao) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : padrao);
  const commit = (env.GIT_SHA || env.RENDER_GIT_COMMIT || env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7);
  return {
    producao,
    raiz: RAIZ,
    porta: num(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    // pasta com o banco (casa.db), as cópias de segurança e nada mais; precisa ser um disco que não se apaga a cada atualização
    dataDir: path.resolve(env.DATA_DIR || path.join(RAIZ, 'dados-servidor')),
    webDir: path.resolve(env.WEB_DIR || path.join(RAIZ, 'dist')),
    // endereço público (https://...); usado nos links de convite e para conferir a origem dos pedidos
    urlPublica: (env.URL_PUBLICA || env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''),
    cookieSeguro: env.COOKIE_SEGURO !== undefined ? env.COOKIE_SEGURO !== '0' : producao,
    // atrás de um proxy (Render, Railway, Caddy) o IP real vem no X-Forwarded-For
    proxyConfiavel: env.TRUST_PROXY !== undefined ? (env.TRUST_PROXY === '0' ? false : num(env.TRUST_PROXY, true)) : (producao ? 1 : false),
    adminEmail: (env.ADMIN_EMAIL || '').trim(),
    adminSenha: env.ADMIN_SENHA_INICIAL || '',
    adminNome: env.ADMIN_NOME || 'Administrador',
    importarCasa975: env.IMPORTAR_CASA_975 !== '0',
    sessaoDias: num(env.SESSAO_DIAS, 30),
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    claudeModelo: env.CLAUDE_MODELO || 'claude-opus-5-5',
    claudeLimiteHora: num(env.CLAUDE_LIMITE_HORA, 30),     // pedidos por pessoa por hora
    claudeLimiteDia: num(env.CLAUDE_LIMITE_DIA, 300),      // pedidos de todo mundo por dia (protege a conta da API)
    backupDias: num(env.BACKUP_DIAS, 14),
    versao: pacote.version + (commit ? '+' + commit : ''),
    logNivel: env.LOG_NIVEL || (env.NODE_ENV === 'test' ? 'silent' : 'info'),
  };
}

module.exports = { lerConfig, RAIZ };
