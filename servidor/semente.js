// Primeira vez que o servidor sobe: cria o administrador (ADMIN_EMAIL + ADMIN_SENHA_INICIAL) e o projeto
// "Casa 975" com os móveis exportados do artefato (dados/itens.json e dados/config-casa.json).
const fs = require('fs');
const path = require('path');
const { agora, registrar } = require('./db');
const { gerarHash, problemaNaSenha } = require('./senhas');
const { emailValido } = require('./util');
const { criarProjeto, modeloCasa975, validarOuFalhar } = require('./rotas/projetos');

async function semear(app) {
  const { db, cfg, log } = app;
  const temGente = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n > 0;
  if (!temGente) {
    const email = cfg.adminEmail.toLowerCase();
    if (!emailValido(email) || !cfg.adminSenha) {
      log.warn('Nenhuma pessoa cadastrada. Defina ADMIN_EMAIL e ADMIN_SENHA_INICIAL e reinicie, ou rode: npm run convidar -- seu@email --admin');
      return;
    }
    const p = problemaNaSenha(cfg.adminSenha, email);
    if (p) { log.error(`ADMIN_SENHA_INICIAL não serve: ${p}`); return; }
    const { lastInsertRowid } = db.prepare('INSERT INTO usuarios (email, nome, senha, admin, ativo, criado_em, senha_em) VALUES (?, ?, ?, 1, 1, ?, ?)')
      .run(email, cfg.adminNome, await gerarHash(cfg.adminSenha), agora(), agora());
    registrar(db, Number(lastInsertRowid), 'administrador-criado', email);
    log.info(`Administrador criado: ${email}. Depois de entrar, troque a senha e apague ADMIN_SENHA_INICIAL das variáveis.`);
  }
  const semProjetos = db.prepare('SELECT COUNT(*) AS n FROM projetos').get().n === 0;
  if (semProjetos && cfg.importarCasa975) {
    const admin = db.prepare('SELECT id FROM usuarios WHERE admin = 1 AND ativo = 1 ORDER BY id LIMIT 1').get();
    if (!admin) return;
    const ler = arq => { try { return JSON.parse(fs.readFileSync(path.join(cfg.raiz, 'dados', arq), 'utf8')); } catch { return null; } };
    const itens = ler('itens.json'), config = ler('config-casa.json');
    const id = criarProjeto(app, { nome: 'Casa 975', planta: validarOuFalhar(modeloCasa975()), config: config || {}, itens: Array.isArray(itens) ? itens : [] }, admin.id);
    registrar(db, admin.id, 'criou-projeto', id, 'casa-975 (primeira vez)');
    log.info(`Projeto "Casa 975" criado com ${Array.isArray(itens) ? itens.length : 0} itens.`);
  }
}

module.exports = { semear };
