// Liga o servidor: node servidor/index.js (ou npm start). Variáveis de ambiente em .env.exemplo.
const { lerConfig } = require('./config');
const { criarApp } = require('./app');
const { semear } = require('./semente');
const { agendarCopias } = require('./backup');

(async () => {
  const cfg = lerConfig();
  const app = await criarApp(cfg);
  await semear(app);
  agendarCopias(app);
  if (!app.claude) app.log.info('ANTHROPIC_API_KEY não definida: as funções com o Claude ficam escondidas.');
  if (cfg.producao && !cfg.urlPublica) app.log.warn('URL_PUBLICA não definida: os links de convite usam o endereço do pedido.');
  const parar = async sinal => { app.log.info(`${sinal}: desligando`); try { await app.close(); } finally { process.exit(0); } };
  process.on('SIGTERM', parar);
  process.on('SIGINT', parar);
  await app.listen({ port: cfg.porta, host: cfg.host });
  app.log.info(`Casa Planta ${cfg.versao} no ar na porta ${cfg.porta} (dados em ${cfg.dataDir})`);
})().catch(e => { console.error(e); process.exit(1); });
