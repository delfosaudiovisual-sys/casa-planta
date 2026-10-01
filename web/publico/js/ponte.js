// Ponte entre a página 3D (feita para o artefato do claude.ai) e este servidor.
// A página pede window.claude.use('db' | 'downloads' | 'sample'); aqui cada um é atendido pela API do programa:
//   db        móveis e ajustes do projeto, com tempo real (Server-Sent Events)
//   downloads salvar imagem e planilha no computador
//   sample    perguntas ao Claude, pelo servidor (a chave da API nunca chega ao navegador)
// Assim src/casa-975-3d.html continua igual ao do artefato e funciona nos dois lugares.
(function () {
  'use strict';
  const P = window.__PROJETO;
  if (!P) return;
  const base = `/api/projetos/${encodeURIComponent(P.id)}`;
  const enc = encodeURIComponent;

  async function chamar(metodo, url, corpo, signal) {
    let r;
    try {
      r = await fetch(url, { method: metodo, credentials: 'same-origin', signal,
        headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : {}, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
    } catch (e) { throw Object.assign(new Error(e.name === 'AbortError' ? 'cancelado' : 'sem conexão'), { code: e.name === 'AbortError' ? 'cancelled' : 'rede' }); }
    let d = null;
    try { d = await r.json(); } catch { /* sem corpo */ }
    if (!r.ok) {
      const code = (d && d.codigo) || (r.status === 403 ? 'somente_leitura' : r.status === 401 ? 'session_expired' : 'erro');
      throw Object.assign(new Error((d && d.erro) || 'erro ' + r.status), { code, status: r.status });
    }
    return d;
  }
  const ALFA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  function novoId() { const b = crypto.getRandomValues(new Uint8Array(20)); let s = ''; for (const x of b) s += ALFA[x % 62]; return s; }

  // ------------------------------------------------------------------ banco (cópia local do que está no servidor)
  let docs = new Map(), itensProntos = false, cfg = null, es = null, tEmitir = null, tReconectar = null;
  const ouvItens = new Map(), ouvCfg = new Map();
  const fotoItens = () => ({ docs: [...docs].map(([id, d]) => ({ id, data: () => ({ ...d }) })) });
  const fotoCfg = () => ({ exists: !!cfg, data: () => ({ ...(cfg || {}) }) });
  function emitirItens() { clearTimeout(tEmitir); tEmitir = setTimeout(() => { for (const cb of ouvItens.keys()) cb(fotoItens()); }, 30); }

  function conectar() {
    clearTimeout(tReconectar);
    es = new EventSource(base + '/eventos');
    es.addEventListener('itens', e => { docs = new Map(JSON.parse(e.data).map(({ id, ...d }) => [id, d])); itensProntos = true; emitirItens(); });
    es.addEventListener('item', e => { const m = JSON.parse(e.data); if (m.apagado) docs.delete(m.id); else docs.set(m.id, m.dados); emitirItens(); });
    es.addEventListener('config', e => { cfg = JSON.parse(e.data); for (const cb of ouvCfg.keys()) cb(fotoCfg()); });
    es.addEventListener('planta', e => { if (JSON.parse(e.data).versao !== P.plantaVersao) faixa('A planta deste projeto foi alterada.', 'Recarregar', () => location.reload()); });
    es.addEventListener('acesso', () => { es.close(); location.reload(); });
    es.onerror = () => {
      for (const err of ouvItens.values()) if (err) err(new Error('sem conexão'));
      if (es.readyState === EventSource.CLOSED) {        // o servidor recusou: sessão vencida, acesso tirado ou servidor reiniciando
        tReconectar = setTimeout(async () => {
          const r = await fetch('/api/eu', { credentials: 'same-origin' }).catch(() => null);
          if (r && r.status === 401) location.href = '/entrar?volta=' + enc(location.pathname);
          else conectar();
        }, 4000);
      }
    };
  }

  const ref = id => ({
    id,
    set: dados => chamar('PUT', `${base}/itens/${enc(id)}`, dados).then(r => { docs.set(r.id, r.dados); }),
    update: parte => chamar('PATCH', `${base}/itens/${enc(id)}`, parte).then(r => { docs.set(r.id, r.dados); }),
    delete: () => chamar('DELETE', `${base}/itens/${enc(id)}`).then(() => { docs.delete(id); }),
  });
  const db = {
    somenteLeitura: P.papel === 'leitor',
    collection(nome) {
      if (nome !== 'itens') throw new Error('coleção desconhecida: ' + nome);
      return {
        onSnapshot(cb, err) { ouvItens.set(cb, err); if (!es) conectar(); else if (itensProntos) cb(fotoItens()); return () => ouvItens.delete(cb); },
        doc: id => ref(id || novoId()),
      };
    },
    doc(caminho) {
      if (caminho !== 'config/casa') throw new Error('documento desconhecido: ' + caminho);
      return {
        onSnapshot(cb, err) { ouvCfg.set(cb, err); if (cfg) cb(fotoCfg()); return () => ouvCfg.delete(cb); },
        set: dados => chamar('PUT', base + '/config', dados).then(r => { cfg = r; }),
      };
    },
  };

  // ------------------------------------------------------------------ downloads
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.csv$/i.test(filename) ? 'text/csv;charset=utf-8' : 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = String(filename || 'arquivo').replace(/[\\/:*?"<>|]+/g, '-');
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    },
  };

  // ------------------------------------------------------------------ Claude (pelo servidor)
  const sample = {
    async json(prompt, { signal, onText } = {}) {
      if (onText) onText('');
      const r = await chamar('POST', '/api/claude/json', { prompt }, signal);
      return r.resposta;
    },
  };

  window.claude = {
    nuvem: true,
    async use(cap) {
      if (cap === 'db') return db;
      if (cap === 'downloads') return downloads;
      if (cap === 'sample') return P.claude ? sample : null;
      return null;
    },
  };

  // ------------------------------------------------------------------ avisos no alto da tela
  function faixa(texto, botao, acao) {
    let f = document.getElementById('nvFaixa');
    if (!f) {
      f = document.createElement('div'); f.id = 'nvFaixa'; f.setAttribute('role', 'status');
      Object.assign(f.style, { position: 'fixed', left: '50%', top: '10px', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', gap: '10px', alignItems: 'center',
        background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--accent)', borderRadius: '10px', padding: '8px 12px', font: '14px var(--sans)', boxShadow: '0 4px 18px rgba(0,0,0,.18)' });
      document.body.append(f);
    }
    const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = botao; b.onclick = acao;
    const s = document.createElement('span'); s.textContent = texto;
    f.replaceChildren(s, b);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const ed = document.getElementById('nvEditar');
    if (ed && P.papel === 'leitor') ed.textContent = 'Ver planta';
  });
}());
