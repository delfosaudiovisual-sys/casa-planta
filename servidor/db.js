// Banco SQLite num arquivo só (DATA_DIR/casa.db). As mudanças de estrutura ficam em MIGRACOES, em ordem:
// para mudar o banco numa atualização, acrescente um item no fim da lista (nunca altere os que já existem).
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const MIGRACOES = [
  `
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nome TEXT NOT NULL,
    senha TEXT,                                   -- scrypt; vazio até a pessoa aceitar o convite
    admin INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL,
    senha_em TEXT
  );
  CREATE TABLE sessoes (
    id TEXT PRIMARY KEY,                          -- sha256 do token; o token mesmo só existe no cookie
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criada_em TEXT NOT NULL,
    expira_em TEXT NOT NULL,
    visto_em TEXT NOT NULL,
    ip TEXT,
    agente TEXT
  );
  CREATE INDEX sessoes_usuario ON sessoes(usuario_id);
  CREATE TABLE convites (
    id TEXT PRIMARY KEY,                          -- sha256 do token do link
    tipo TEXT NOT NULL CHECK (tipo IN ('convite', 'senha')),
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em TEXT NOT NULL,
    expira_em TEXT NOT NULL,
    usado_em TEXT
  );
  CREATE TABLE projetos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    planta TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    planta_versao INTEGER NOT NULL DEFAULT 1,
    criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );
  CREATE TABLE membros (
    projeto_id TEXT NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    papel TEXT NOT NULL CHECK (papel IN ('dono', 'editor', 'leitor')),
    PRIMARY KEY (projeto_id, usuario_id)
  );
  CREATE INDEX membros_usuario ON membros(usuario_id);
  CREATE TABLE itens (
    projeto_id TEXT NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    dados TEXT NOT NULL,
    atualizado_em TEXT NOT NULL,
    atualizado_por INTEGER,
    PRIMARY KEY (projeto_id, id)
  );
  CREATE TABLE plantas_antigas (
    id INTEGER PRIMARY KEY,
    projeto_id TEXT NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    versao INTEGER NOT NULL,
    planta TEXT NOT NULL,
    criado_em TEXT NOT NULL,
    criado_por INTEGER
  );
  CREATE INDEX plantas_antigas_projeto ON plantas_antigas(projeto_id, versao);
  CREATE TABLE referencias (
    id TEXT PRIMARY KEY,
    projeto_id TEXT NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    nome TEXT,
    dados BLOB NOT NULL,
    tamanho INTEGER NOT NULL,
    criado_em TEXT NOT NULL,
    criado_por INTEGER
  );
  CREATE INDEX referencias_projeto ON referencias(projeto_id);
  CREATE TABLE registro (
    id INTEGER PRIMARY KEY,
    quando TEXT NOT NULL,
    usuario_id INTEGER,
    acao TEXT NOT NULL,
    alvo TEXT,
    detalhe TEXT
  );
  CREATE TABLE uso_claude (
    dia TEXT NOT NULL,
    usuario_id INTEGER NOT NULL,
    pedidos INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dia, usuario_id)
  );
  `,
];

function abrirBanco(arquivo) {
  if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new Database(arquivo);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  const atual = db.pragma('user_version', { simple: true });
  if (atual > MIGRACOES.length) throw new Error(`O banco é de uma versão mais nova do programa (${atual} > ${MIGRACOES.length}).`);
  for (let i = atual; i < MIGRACOES.length; i++) {
    db.transaction(() => { db.exec(MIGRACOES[i]); db.pragma(`user_version = ${i + 1}`); })();
  }
  return db;
}

const agora = () => new Date().toISOString();

function registrar(db, usuarioId, acao, alvo = null, detalhe = null) {
  db.prepare('INSERT INTO registro (quando, usuario_id, acao, alvo, detalhe) VALUES (?, ?, ?, ?, ?)')
    .run(agora(), usuarioId ?? null, acao, alvo, detalhe == null ? null : String(detalhe).slice(0, 500));
}

module.exports = { abrirBanco, agora, registrar, MIGRACOES };
