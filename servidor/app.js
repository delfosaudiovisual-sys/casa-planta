// Monta o servidor (Fastify). index.js liga ele numa porta; os testes usam app.inject() sem porta nenhuma.
const fs = require('fs');
const path = require('path');
const Fastify = require('fastify');
const { abrirBanco } = require('./db');
const { lerSessao } = require('./sessoes');
const { criarHub } = require('./tempo-real');
const { criarClaude } = require('./claude');
const { ErroHttp } = require('./util');
const { paginaSimples } = require('./app-paginas');

async function criarApp(cfg, opcoes = {}) {
  const app = Fastify({
    logger: { level: cfg.logNivel, redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] },
    trustProxy: cfg.proxyConfiavel,
    bodyLimit: 2 * 1024 * 1024,
    forceCloseConnections: true,
  });

  const db = opcoes.db || abrirBanco(path.join(cfg.dataDir, 'casa.db'));
  app.decorate('cfg', cfg);
  app.decorate('db', db);
  app.decorate('hub', criarHub(app.log));
  app.decorate('claude', opcoes.claude !== undefined ? opcoes.claude : criarClaude(cfg, app.log));
  app.decorateRequest('usuario', null);

  // cabeçalhos de segurança: só scripts, estilos, fontes e imagens do próprio site
  await app.register(require('@fastify/helmet'), {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(cfg.cookieSeguro ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    referrerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    hsts: cfg.cookieSeguro ? { maxAge: 31536000, includeSubDomains: false } : false,
  });
  app.addHook('onSend', async (req, reply) => { reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'); });

  await app.register(require('@fastify/cookie'));
  await app.register(require('@fastify/rate-limit'), {
    global: true, max: 900, timeWindow: '1 minute',
    keyGenerator: req => (req.usuario ? 'u' + req.usuario.id : req.ip),
    errorResponseBuilder: (req, ctx) => ({ statusCode: 429, erro: `Muitos pedidos seguidos. Espere ${Math.ceil(ctx.ttl / 1000)} segundos.`, codigo: 'rate_limited' }),
  });

  // quem está logado
  app.addHook('onRequest', async (req, reply) => { req.usuario = lerSessao(app, req, reply); });

  // Pedidos que mudam alguma coisa só valem se vierem das páginas do próprio site (proteção contra CSRF,
  // além do cookie SameSite=Lax). Navegadores mandam Origin e Sec-Fetch-Site; programas como curl não mandam nenhum dos dois.
  app.addHook('onRequest', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const origem = req.headers.origin, site = req.headers['sec-fetch-site'];
    // vale o endereço público configurado e o próprio endereço por onde o pedido chegou (ex.: domínio próprio)
    if (origem && origem !== `${req.protocol}://${req.host}` && origem !== cfg.urlPublica) throw new ErroHttp(403, 'Pedido de outro site recusado.');
    if (site && !['same-origin', 'none'].includes(site)) throw new ErroHttp(403, 'Pedido de outro site recusado.');
  });

  app.setErrorHandler((e, req, reply) => {
    const status = e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
    if (status >= 500) req.log.error(e);
    let msg = status >= 500 && !(e instanceof ErroHttp) ? 'Erro interno. Tente de novo.' : e.message;
    if (e.validation) msg = 'Dados inválidos: ' + e.message;
    if (e.code === 'FST_ERR_CTP_BODY_TOO_LARGE') msg = 'Arquivo ou dados grandes demais.';
    if (e.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') msg = 'Formato de dados não aceito.';
    reply.code(status).header('Cache-Control', 'no-store').send({ erro: msg, codigo: e.codigo || undefined });
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ erro: 'Não encontrado.' });
    return reply.code(404).type('text/html').send(paginaSimples('Página não encontrada', 'Este endereço não existe ou você não tem acesso a ele.'));
  });

  app.get('/saude', async () => {
    db.prepare('SELECT 1').get();
    return { ok: true, versao: cfg.versao };
  });

  await app.register(require('./rotas/conta'));
  await app.register(require('./rotas/usuarios'));
  await app.register(require('./rotas/projetos'));
  await app.register(require('./rotas/itens'));
  await app.register(require('./rotas/referencias'));
  await app.register(require('./rotas/claude'));
  await app.register(require('./rotas/admin'));
  await app.register(require('./rotas/paginas'));

  // arquivos estáticos (css, js, three.js, fontes); as páginas HTML passam pelas rotas acima
  const publico = path.join(cfg.webDir, 'publico');
  if (fs.existsSync(publico)) {
    await app.register(require('@fastify/static'), {
      root: publico, prefix: '/', index: false, list: false, wildcard: true, dotfiles: 'deny',
      cacheControl: true, maxAge: cfg.producao ? '7d' : 0,
    });
  } else app.log.warn(`Pasta ${publico} não existe: rode "npm run montar" antes.`);

  app.addHook('onClose', async () => { app.hub.fecharTudo(); if (!opcoes.db) db.close(); });
  return app;
}

module.exports = { criarApp };
