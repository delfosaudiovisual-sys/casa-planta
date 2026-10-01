// Coisas do administrador: baixar uma cópia do banco inteiro e ver o registro de acessos.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { registrar } = require('../db');
const { exigirAdmin } = require('../sessoes');
const { fazerCopia } = require('../backup');

module.exports = async function (app) {
  app.get('/api/admin/copia', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const u = exigirAdmin(req);
    const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'casa-')), 'casa.db');
    await fazerCopia(app.db, arq);
    registrar(app.db, u.id, 'baixou-copia');
    const nome = `casa-planta-${new Date().toISOString().slice(0, 10)}.db`;
    const fluxo = fs.createReadStream(arq);
    fluxo.on('close', () => fs.rm(path.dirname(arq), { recursive: true, force: true }, () => {}));
    reply.header('Content-Disposition', `attachment; filename="${nome}"`).header('Cache-Control', 'no-store').type('application/vnd.sqlite3');
    return reply.send(fluxo);
  });

  app.get('/api/admin/registro', async (req) => {
    exigirAdmin(req);
    return app.db.prepare(`SELECT r.quando, r.acao, r.alvo, r.detalhe, u.nome, u.email FROM registro r LEFT JOIN usuarios u ON u.id = r.usuario_id
      ORDER BY r.id DESC LIMIT 300`).all();
  });
};
