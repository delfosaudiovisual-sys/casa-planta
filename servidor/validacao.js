// Conferência dos dados que chegam das páginas (móveis e configuração). A página 3D pode ganhar campos novos
// sem mexer aqui: aceitamos qualquer campo com nome simples, com limites de tamanho, e conferimos os perigosos (link).
const { erro } = require('./util');

const NOME_CAMPO = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const CHAVE = { test: k => NOME_CAMPO.test(k) && !['__proto__', 'constructor', 'prototype'].includes(k) };
const MAX_ITEM = 32 * 1024, MAX_CONFIG = 64 * 1024;

function conferirValor(v, prof, caminho) {
  if (v === null || typeof v === 'boolean') return;
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw erro(400, `${caminho}: número inválido`); return; }
  if (typeof v === 'string') { if (v.length > 4000) throw erro(400, `${caminho}: texto longo demais`); return; }
  if (prof >= 4) throw erro(400, `${caminho}: dados aninhados demais`);
  if (Array.isArray(v)) { if (v.length > 500) throw erro(400, `${caminho}: lista longa demais`); v.forEach((x, i) => conferirValor(x, prof + 1, `${caminho}[${i}]`)); return; }
  if (typeof v === 'object') {
    const ks = Object.keys(v); if (ks.length > 200) throw erro(400, `${caminho}: campos demais`);
    for (const k of ks) { if (k.length > 60 || k === '__proto__' || k === 'constructor' || k === 'prototype') throw erro(400, `${caminho}: campo inválido`); conferirValor(v[k], prof + 1, `${caminho}.${k}`); }
    return;
  }
  throw erro(400, `${caminho}: tipo inválido`);
}

function objetoSimples(dados, oque) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw erro(400, `${oque}: esperava um objeto`);
}

// item completo (set) ou parte dele (update). Devolve uma cópia limpa.
function limparItem(dados, parcial = false) {
  objetoSimples(dados, 'item');
  const out = {};
  const ks = Object.keys(dados);
  if (ks.length > 80) throw erro(400, 'item: campos demais');
  for (const k of ks) {
    if (k === 'id') continue;
    if (!CHAVE.test(k)) throw erro(400, `item: campo "${k.slice(0, 40)}" inválido`);
    conferirValor(dados[k], 1, k);
    out[k] = dados[k];
  }
  if ('link' in out && out.link !== null && out.link !== '') {
    if (typeof out.link !== 'string' || out.link.length > 2000 || !/^https?:\/\/[^\s]+$/i.test(out.link)) throw erro(400, 'O link precisa começar com http:// ou https://');
  }
  if ('cor' in out && out.cor !== null && !(typeof out.cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(out.cor))) throw erro(400, 'Cor inválida');
  if (!parcial && typeof out.nome !== 'string') throw erro(400, 'item: falta o nome');
  if (JSON.stringify(out).length > MAX_ITEM) throw erro(400, 'item: dados grandes demais');
  return out;
}

function limparConfig(dados) {
  objetoSimples(dados, 'configuração');
  const out = {};
  for (const k of Object.keys(dados)) {
    if (!CHAVE.test(k)) throw erro(400, `configuração: campo "${k.slice(0, 40)}" inválido`);
    conferirValor(dados[k], 1, k);
    out[k] = dados[k];
  }
  if ('aberturas' in out) {
    const a = out.aberturas;
    if (a !== null && (typeof a !== 'object' || Array.isArray(a))) throw erro(400, 'configuração: aberturas inválidas');
    for (const [id, v] of Object.entries(a || {})) {
      if (!/^w\d{1,4}o\d{1,3}$/.test(id)) throw erro(400, 'configuração: abertura inválida');
      if (v !== null && (typeof v !== 'object' || Object.entries(v).some(([kk, n]) => !['a', 'b', 'base', 'top'].includes(kk) || (n !== null && typeof n !== 'number')))) throw erro(400, 'configuração: abertura inválida');
    }
  }
  if (JSON.stringify(out).length > MAX_CONFIG) throw erro(400, 'configuração grande demais');
  return out;
}

module.exports = { limparItem, limparConfig, objetoSimples };
