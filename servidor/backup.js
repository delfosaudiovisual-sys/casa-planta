// Cópias de segurança do banco: uma por dia em DATA_DIR/copias (guarda as últimas BACKUP_DIAS),
// e o administrador pode baixar uma cópia na hora pela página de projetos.
const fs = require('fs');
const path = require('path');

async function fazerCopia(db, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  await db.backup(destino);
  return destino;
}

function agendarCopias(app) {
  const pasta = path.join(app.cfg.dataDir, 'copias');
  async function rodar() {
    try {
      const dia = new Date().toISOString().slice(0, 10), arq = path.join(pasta, `casa-${dia}.db`);
      if (!fs.existsSync(arq)) { await fazerCopia(app.db, arq); app.log.info(`cópia de segurança: ${arq}`); }
      const velhas = fs.readdirSync(pasta).filter(n => /^casa-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort().reverse().slice(app.cfg.backupDias);
      for (const n of velhas) fs.unlinkSync(path.join(pasta, n));
    } catch (e) { app.log.error(e, 'falha na cópia de segurança'); }
  }
  const t0 = setTimeout(rodar, 60e3), t = setInterval(rodar, 6 * 3600e3);
  t0.unref(); t.unref();
  app.addHook('onClose', async () => { clearTimeout(t0); clearInterval(t); });
}

module.exports = { fazerCopia, agendarCopias };
