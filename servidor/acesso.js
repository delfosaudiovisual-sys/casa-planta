// Quem pode o quê num projeto. Papéis: leitor (só vê) < editor (muda móveis, planta e ajustes) < dono (também convida e apaga).
const { exigirUsuario } = require('./sessoes');
const { erro, ID_PROJETO } = require('./util');

const ORDEM = { leitor: 1, editor: 2, dono: 3 };

function papelNoProjeto(db, projetoId, usuarioId) {
  const m = db.prepare('SELECT papel FROM membros WHERE projeto_id = ? AND usuario_id = ?').get(projetoId, usuarioId);
  return m ? m.papel : null;
}

// Sem acesso, responde "não encontrado" (não conta que o projeto existe).
function exigirPapel(app, req, projetoId, minimo = 'leitor') {
  const usuario = exigirUsuario(req);
  if (typeof projetoId !== 'string' || !ID_PROJETO.test(projetoId)) throw erro(404, 'Projeto não encontrado.');
  const papel = papelNoProjeto(app.db, projetoId, usuario.id);
  if (!papel) throw erro(404, 'Projeto não encontrado.');
  if (ORDEM[papel] < ORDEM[minimo]) throw erro(403, minimo === 'dono' ? 'Só o dono do projeto pode fazer isso.' : 'Você pode ver este projeto, mas não alterar.', 'somente_leitura');
  return { usuario, papel };
}

module.exports = { papelNoProjeto, exigirPapel, ORDEM };
