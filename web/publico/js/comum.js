// Ajudantes das telas: pedidos à API e montagem de elementos (sem innerHTML, para nada digitado virar código).
(function () {
  'use strict';
  async function api(metodo, url, corpo, opcoes = {}) {
    const init = { method: metodo, credentials: 'same-origin', headers: {}, signal: opcoes.signal };
    if (corpo instanceof Blob) { init.body = corpo; init.headers['Content-Type'] = corpo.type || 'application/octet-stream'; }
    else if (corpo !== undefined) { init.body = JSON.stringify(corpo); init.headers['Content-Type'] = 'application/json'; }
    Object.assign(init.headers, opcoes.headers || {});
    let r;
    try { r = await fetch(url, init); }
    catch (e) { if (e.name === 'AbortError') throw Object.assign(new Error('Cancelado.'), { codigo: 'cancelled' }); throw Object.assign(new Error('Sem conexão com o servidor. Confira a internet e tente de novo.'), { codigo: 'rede' }); }
    let dados = null;
    try { dados = await r.json(); } catch { /* sem corpo */ }
    if (r.status === 401 && !opcoes.semRedirecionar) { location.href = '/entrar?volta=' + encodeURIComponent(location.pathname + location.search); throw new Error('Entre de novo.'); }
    if (!r.ok) throw Object.assign(new Error((dados && dados.erro) || `Erro ${r.status}`), { status: r.status, codigo: dados && dados.codigo });
    return dados;
  }

  function el(tag, props = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'texto') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k in e && typeof v !== 'string') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat()) if (f != null && f !== false) e.append(f.nodeType ? f : String(f));
    return e;
  }

  let tt = null;
  function aviso(msg, ms = 3500) {
    let t = document.querySelector('.toast');
    if (!t) { t = el('div', { class: 'toast', role: 'status' }); document.body.append(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, ms);
  }

  const $ = id => document.getElementById(id);
  const quando = iso => { try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; } };
  // só aceita voltar para um endereço deste site
  const destinoSeguro = v => (typeof v === 'string' && /^\/(?![/\\])[^\s]*$/.test(v) ? v : '/projetos');

  window.Casa = { api, el, aviso, $, quando, destinoSeguro };
}());
