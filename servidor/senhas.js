// Senhas com scrypt (embutido no Node). Formato guardado: scrypt$N$r$p$sal$hash (base64).
const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const N = 2 ** 15, R = 8, P = 1, TAM = 32, MAXMEM = 64 * 1024 * 1024;

// senhas muito usadas (as mais comuns em vazamentos, incluindo as brasileiras)
const COMUNS = new Set(['1234567890', '12345678910', '0123456789', 'qwertyuiop', 'senha12345', 'senha123456', 'password123', 'password12',
  'abcdefghij', '1111111111', '0000000000', 'brasil1234', 'mudar12345', 'admin12345', 'iloveyou12', 'qwerty1234', '1q2w3e4r5t', 'abc1234567']);

function problemaNaSenha(senha, email = '') {
  if (typeof senha !== 'string') return 'Informe a senha.';
  if (senha.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (senha.length > 200) return 'A senha pode ter no máximo 200 caracteres.';
  const s = senha.toLowerCase();
  if (COMUNS.has(s) || /^(.)\1+$/.test(s)) return 'Essa senha é muito fácil de adivinhar. Escolha outra.';
  if (email && s.includes(email.toLowerCase().split('@')[0]) && email.split('@')[0].length >= 4) return 'A senha não pode conter o seu e-mail.';
  return null;
}

async function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const h = await scrypt(senha.normalize('NFKC'), sal, TAM, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${h.toString('base64')}`;
}

// hash falso: quem tenta um e-mail que não existe espera o mesmo tempo de quem erra a senha
let falso = null;
async function conferirSenha(senha, guardado) {
  if (typeof senha !== 'string' || senha.length > 200) return false;
  if (!guardado) { falso = falso || await gerarHash('senha-falsa-para-igualar-o-tempo'); guardado = falso; senha += '\u0000'; }
  const [alg, n, r, p, sal, hash] = String(guardado).split('$');
  if (alg !== 'scrypt') return false;
  const esperado = Buffer.from(hash, 'base64');
  const h = await scrypt(senha.normalize('NFKC'), Buffer.from(sal, 'base64'), esperado.length, { N: +n, r: +r, p: +p, maxmem: MAXMEM });
  return crypto.timingSafeEqual(h, esperado);
}

module.exports = { gerarHash, conferirSenha, problemaNaSenha };
