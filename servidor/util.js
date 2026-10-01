const crypto = require('crypto');

class ErroHttp extends Error {
  constructor(status, mensagem, codigo) { super(mensagem); this.statusCode = status; this.codigo = codigo; }
}
const erro = (status, mensagem, codigo) => new ErroHttp(status, mensagem, codigo);

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const token = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
// ids curtos e impossíveis de adivinhar (a permissão é conferida de qualquer jeito)
const ALFA = 'abcdefghijkmnopqrstuvwxyz23456789';
function novoId(n = 14) {
  const b = crypto.randomBytes(n); let s = '';
  for (let i = 0; i < n; i++) s += ALFA[b[i] % ALFA.length];
  return s;
}
const ID_PROJETO = /^[a-z0-9]{6,32}$/;
const ID_ITEM = /^[A-Za-z0-9_-]{1,64}$/;

const emailValido = e => typeof e === 'string' && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const limparTexto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

module.exports = { ErroHttp, erro, sha256, token, novoId, ID_PROJETO, ID_ITEM, emailValido, limparTexto };
