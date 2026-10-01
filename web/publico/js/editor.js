// Editor da planta: cômodos, paredes, portas e janelas, terreno, telhado e planta de fundo (imagem, PDF ou DXF).
// Trabalha numa cópia da planta e só manda para o servidor ao clicar em Salvar (o servidor guarda as versões anteriores).
// Medidas: terreno em metros; o resto em centímetros nos campos (a planta guarda tudo em metros).
(function () {
  'use strict';
  const { api, el, aviso, $, quando } = window.Casa;
  const PL = window.Planta;
  const ID = document.body.dataset.projeto;
  const svg = $('svg'), NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, at = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) if (v != null) e.setAttribute(k, v); return e; };

  let P = null, versao = 0, papel = 'leitor', nome = '', podeEditar = false, eu = null;
  let sel = null, ferramenta = 'selecionar', mudou = false;
  const pilhaDesfazer = [], pilhaRefazer = [];
  const vista = { s: 20, ox: -2, oy: 30 };              // pixels por metro e o ponto da planta no canto de cima-esquerda
  const fundo = { url: null, w: 0, h: 0, linhas: null, pontos: null, id: null };
  let arraste = null, parede0 = null, fantasma = null, mouse = null, imaVisto = null, calib = null, moverFundo = false;
  const toques = new Map();

  const cm = m => Math.round(m * 100);
  const mm2 = v => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
  const arred = v => Math.round(v * 10000) / 10000;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ESP = () => P.espessura || 0.15;
  const X = x => (x - vista.ox) * vista.s, Y = y => (vista.oy - y) * vista.s;
  const mundo = (sx, sy) => [sx / vista.s + vista.ox, vista.oy - sy / vista.s];
  const eixoX = PL.eixoX;
  const add = (pai, ...f) => pai.append(...f.flat().filter(x => x != null && x !== false));   // append sem virar "null"/"false" na tela
  const NOMES = PL.NOMES_ABERTURA;
  const LARG_PADRAO = { door: 0.80, win: 1.20, glass: 1.60, basc: 0.60 };

  // ------------------------------------------------------------------ desfazer, mudanças
  function marcar() {
    pilhaDesfazer.push(JSON.stringify(P)); if (pilhaDesfazer.length > 120) pilhaDesfazer.shift();
    pilhaRefazer.length = 0; mudou = true; atualizarEstado();
  }
  function trocarPor(json, para) { para.push(JSON.stringify(P)); P = JSON.parse(json); sel = null; mudou = true; depois({ paredes: false }); carregarFundo(); }
  function desfazer() { if (pilhaDesfazer.length) trocarPor(pilhaDesfazer.pop(), pilhaRefazer); }
  function refazer() { if (pilhaRefazer.length) trocarPor(pilhaRefazer.pop(), pilhaDesfazer); }
  function atualizarEstado() {
    $('estado').textContent = !podeEditar ? 'só para ver' : mudou ? 'alterações não salvas' : 'salvo';
    $('estado').classList.toggle('mudou', mudou);
    $('bSalvar').disabled = !mudou || !podeEditar;
    $('bDesfazer').disabled = !pilhaDesfazer.length; $('bRefazer').disabled = !pilhaRefazer.length;
  }
  // depois de qualquer mudança: paredes que acompanham os cômodos, folhas das portas, pisos e muros automáticos
  function depois({ paredes = true, painel = true } = {}) {
    if (paredes && P.paredesPelosComodos) P.paredes = PL.paredesDosComodos(P.comodos, ESP(), P.paredes);
    PL.derivar(P);
    if (sel && !objetoSel()) sel = null;
    atualizarEstado(); pedirDesenho(); if (painel) montarPaineis();
  }
  function objetoSel() {
    if (!sel) return null;
    if (sel.tipo === 'comodo') return P.comodos[sel.i];
    if (sel.tipo === 'parede') return P.paredes[sel.i];
    if (sel.tipo === 'abertura') return P.paredes[sel.i] && P.paredes[sel.i][4][sel.j];
    return null;
  }

  // ------------------------------------------------------------------ desenho
  const camadas = {};
  for (const n of ['grade', 'fundo', 'lote', 'comodos', 'paredes', 'aberturas', 'textos', 'topo']) { camadas[n] = sv('g'); svg.append(camadas[n]); }
  const gFundoConteudo = sv('g'); camadas.fundo.append(gFundoConteudo);
  let agendado = false;
  function pedirDesenho() { if (!agendado) { agendado = true; requestAnimationFrame(desenhar); } }

  function desenhar() {
    agendado = false;
    if (!P) return;
    const W = svg.clientWidth, H = svg.clientHeight, s = vista.s;
    // grade
    const g = camadas.grade; g.replaceChildren();
    const [x0, y1] = mundo(0, 0), [x1, y0] = mundo(W, H);
    const passo = s >= 60 ? 0.1 : s >= 14 ? 0.5 : 1, forte = s >= 6 ? 1 : 5;
    for (let x = Math.floor(x0 / passo) * passo; x <= x1; x += passo) { const f = Math.abs(x / forte - Math.round(x / forte)) < 1e-6; g.append(sv('line', { x1: X(x), x2: X(x), y1: 0, y2: H, class: f ? 'grade2' : 'grade1' })); }
    for (let y = Math.floor(y0 / passo) * passo; y <= y1; y += passo) { const f = Math.abs(y / forte - Math.round(y / forte)) < 1e-6; g.append(sv('line', { y1: Y(y), y2: Y(y), x1: 0, x2: W, class: f ? 'grade2' : 'grade1' })); }
    // fundo (só muda a transformação: as linhas do DXF podem ser muitas)
    camadas.fundo.setAttribute('transform', `translate(${-vista.ox * s} ${vista.oy * s}) scale(${s})`);
    const R = P.referencia;
    camadas.fundo.style.opacity = R ? R.opacidade : 0;
    if (R && fundo.url && R.tipo === 'imagem') {
      let im = gFundoConteudo.querySelector('image');
      if (!im || im.getAttribute('href') !== fundo.url) { gFundoConteudo.replaceChildren(); im = sv('image', { href: fundo.url, preserveAspectRatio: 'none' }); gFundoConteudo.append(im); }
      im.setAttribute('x', R.x); im.setAttribute('y', -R.y); im.setAttribute('width', fundo.w * R.escala); im.setAttribute('height', fundo.h * R.escala);
      im.setAttribute('transform', `rotate(${R.rot || 0} ${R.x} ${-R.y})`);
    } else if (R && fundo.linhas && R.tipo === 'dxf') {
      let gp = gFundoConteudo.querySelector('g');
      if (!gp) { gFundoConteudo.replaceChildren(); gp = sv('g'); gp.append(sv('path', { d: fundo.linhas, class: 'linha-dxf' })); gFundoConteudo.append(gp); }
      gp.setAttribute('transform', `translate(${R.x} ${-R.y}) rotate(${R.rot || 0}) scale(${R.escala} ${-R.escala})`);
    } else gFundoConteudo.replaceChildren();
    // terreno, rua, muros, telhado
    const L = camadas.lote; L.replaceChildren();
    const LW = P.lote.largura, LD = P.lote.profundidade;
    L.append(sv('rect', { x: X(-6), y: Y(0), width: (LW + 12) * s, height: 2.2 * s, class: 'rua' }));
    if (s > 4) { const t = sv('text', { x: X(LW / 2), y: Y(-1.1), class: 'dim-comodo' }); t.textContent = 'rua'; L.append(t); }
    for (const m of P.muros) L.append(sv('rect', { x: X(m[0]), y: Y(m[3]), width: (m[2] - m[0]) * s, height: (m[3] - m[1]) * s, class: 'muro' }));
    for (const m of P.pilares) L.append(sv('rect', { x: X(m[0]), y: Y(m[3]), width: (m[2] - m[0]) * s, height: (m[3] - m[1]) * s, class: 'muro' }));
    L.append(sv('rect', { x: X(0), y: Y(LD), width: LW * s, height: LD * s, class: 'lote' }));
    if (P.portao) L.append(sv('line', { x1: X(P.portao[0]), x2: X(P.portao[1]), y1: Y(0.06), y2: Y(0.06), class: 'cota', 'stroke-dasharray': '3 3' }));
    if (P.telhado) {
      const T = P.telhado;
      L.append(sv('rect', { x: X(T.x0), y: Y(T.fundo), width: (T.x1 - T.x0) * s, height: (T.fundo - T.frente) * s, class: 'telhado' }));
      L.append(sv('line', { x1: X(T.x0), x2: X(T.x1), y1: Y(T.cumeeira), y2: Y(T.cumeeira), class: 'telhado' }));
    }
    // cômodos
    const C = camadas.comodos, TX = camadas.textos; C.replaceChildren(); TX.replaceChildren();
    P.comodos.forEach((c, i) => {
      const [a, b, cc, d] = c.r, ehSel = sel && sel.tipo === 'comodo' && sel.i === i;
      C.append(sv('rect', { x: X(a), y: Y(d), width: (cc - a) * s, height: (d - b) * s, class: 'comodo' + (c.interno ? '' : ' externo') + (ehSel ? ' sel' : '') }));
      if ((cc - a) * s > 46 && (d - b) * s > 26) {
        const t = sv('text', { x: X((a + cc) / 2), y: Y((b + d) / 2) - ((d - b) * s > 44 ? 7 : 0), class: 'nome-comodo' }); t.textContent = c.nome; TX.append(t);
        if ((d - b) * s > 44) { const t2 = sv('text', { x: X((a + cc) / 2), y: Y((b + d) / 2) + 10, class: 'dim-comodo' }); t2.textContent = `${mm2(cc - a)} × ${mm2(d - b)}`; TX.append(t2); }
      }
    });
    // paredes e aberturas
    const PW = camadas.paredes, AB = camadas.aberturas; PW.replaceChildren(); AB.replaceChildren();
    P.paredes.forEach((w, i) => {
      PW.append(sv('rect', { x: X(w[0]), y: Y(w[3]), width: (w[2] - w[0]) * s, height: (w[3] - w[1]) * s, class: 'parede' + (sel && sel.tipo === 'parede' && sel.i === i ? ' sel' : '') }));
      const ax = eixoX(w);
      w[4].forEach((op, j) => {
        const [a, b] = op, r = ax ? [a, w[1], b, w[3]] : [w[0], a, w[2], b];
        AB.append(sv('rect', { x: X(r[0]), y: Y(r[3]), width: (r[2] - r[0]) * s, height: (r[3] - r[1]) * s, class: `abertura ${op[4]}` + (sel && sel.tipo === 'abertura' && sel.i === i && sel.j === j ? ' sel' : '') }));
        const f = PL.folhaDaAbertura(w, op);
        if (f) {
          const [hx, hy, lw, aberta, fechada] = f, ra = aberta * Math.PI / 180, rf = fechada * Math.PI / 180;
          const pa = [hx + Math.cos(ra) * lw, hy + Math.sin(ra) * lw], pf = [hx + Math.cos(rf) * lw, hy + Math.sin(rf) * lw];
          const horario = ((aberta - fechada + 540) % 360 - 180) > 0 ? 0 : 1;
          AB.append(sv('path', { d: `M${X(hx)} ${Y(hy)} L${X(pa[0])} ${Y(pa[1])} A${lw * s} ${lw * s} 0 0 ${horario} ${X(pf[0])} ${Y(pf[1])}`, class: 'folha' }));
        }
      });
    });
    // por cima: entrada, cotas, pré-visualização, ímã
    const T = camadas.topo; T.replaceChildren();
    if (P.entrada) {
      const e = P.entrada, r = e.rumo || 0;        // mesma convenção do modo Caminhar: frente = (-sen, cos)
      T.append(sv('circle', { cx: X(e.x), cy: Y(e.y), r: 6, class: 'entrada' }));
      T.append(sv('line', { x1: X(e.x), y1: Y(e.y), x2: X(e.x - Math.sin(r) * 0.8), y2: Y(e.y + Math.cos(r) * 0.8), class: 'cota' }));
    }
    desenharCotas(T);
    if (fantasma) T.append(sv('rect', { x: X(fantasma[0]), y: Y(fantasma[3]), width: Math.max(1, (fantasma[2] - fantasma[0]) * s), height: Math.max(1, (fantasma[3] - fantasma[1]) * s), class: 'fantasma' }));
    if (imaVisto) T.append(sv('circle', { cx: X(imaVisto[0]), cy: Y(imaVisto[1]), r: 6, class: 'imas' }));
    if (calib) {
      for (const p of [calib.a, calib.b].filter(Boolean)) T.append(sv('circle', { cx: X(p[0]), cy: Y(p[1]), r: 4, class: 'ponto-calib' }));
      const fim = calib.b || mouse;
      if (calib.a && fim) T.append(sv('line', { x1: X(calib.a[0]), y1: Y(calib.a[1]), x2: X(fim[0]), y2: Y(fim[1]), class: 'calib' }));
    }
  }
  function cota(T, x0, y0, x1, y1, texto, desloc = 14) {
    const hz = Math.abs(y1 - y0) < 1e-9, sx0 = X(x0), sy0 = Y(y0), sx1 = X(x1), sy1 = Y(y1);
    const dx = hz ? 0 : desloc, dy = hz ? -desloc : 0;
    T.append(sv('line', { x1: sx0 + dx, y1: sy0 + dy, x2: sx1 + dx, y2: sy1 + dy, class: 'cota' }));
    const t = sv('text', { x: (sx0 + sx1) / 2 + dx * 2.2, y: (sy0 + sy1) / 2 + dy - 3, class: 'cota-txt' }); t.textContent = texto; T.append(t);
  }
  function desenharCotas(T) {
    const o = objetoSel(); if (!o) return;
    if (sel.tipo === 'comodo') { const [a, b, c, d] = o.r; cota(T, a, d, c, d, `${cm(c - a)} cm`); cota(T, c, b, c, d, `${cm(d - b)} cm`); }
    if (sel.tipo === 'parede') { const [a, b, c, d] = o; if (eixoX(o)) cota(T, a, d, c, d, `${cm(c - a)} cm`); else cota(T, c, b, c, d, `${cm(d - b)} cm`); }
    if (sel.tipo === 'abertura') {
      const w = P.paredes[sel.i], [a, b] = o;
      if (eixoX(w)) { cota(T, a, w[3], b, w[3], `${cm(b - a)} cm`); cota(T, w[0], w[1], a, w[1], `${cm(a - w[0])}`, -14); }
      else { cota(T, w[2], a, w[2], b, `${cm(b - a)} cm`); cota(T, w[0], w[1], w[0], a, `${cm(a - w[1])}`, -14); }
    }
  }

  function enquadrar() {
    if (!P) return;
    const W = svg.clientWidth || 800, H = svg.clientHeight || 600, LW = P.lote.largura, LD = P.lote.profundidade;
    const larg = LW + 2, alt = LD + 4.5;
    vista.s = clamp(Math.min(W / larg, H / alt), 2, 400);
    vista.ox = -1 - (W / vista.s - larg) / 2; vista.oy = LD + 1 + (H / vista.s - alt) / 2;
    pedirDesenho();
  }

  // ------------------------------------------------------------------ encontrar coisas sob o ponteiro
  const dentro = (r, x, y, t = 0) => x >= r[0] - t && x <= r[2] + t && y >= r[1] - t && y <= r[3] + t;
  function acharAbertura(x, y) {
    const t = 5 / vista.s;
    for (let i = P.paredes.length - 1; i >= 0; i--) {
      const w = P.paredes[i]; if (!dentro(w, x, y, t)) continue;
      const u = eixoX(w) ? x : y, j = w[4].findIndex(op => u >= op[0] - t && u <= op[1] + t);
      if (j >= 0) return { tipo: 'abertura', i, j };
    }
    return null;
  }
  function acharParede(x, y) {
    const t = 5 / vista.s;
    for (let i = P.paredes.length - 1; i >= 0; i--) if (dentro(P.paredes[i], x, y, t)) return { tipo: 'parede', i };
    return null;
  }
  function acharComodo(x, y) {
    let melhor = null, area = Infinity;
    P.comodos.forEach((c, i) => { const a = (c.r[2] - c.r[0]) * (c.r[3] - c.r[1]); if (dentro(c.r, x, y) && a < area) { melhor = { tipo: 'comodo', i }; area = a; } });
    return melhor;
  }
  const acharQualquer = (x, y) => acharAbertura(x, y) || acharParede(x, y) || acharComodo(x, y);

  // ímã: cantos de paredes e cômodos, pontas das linhas do DXF; senão, grade de 5 cm
  function encaixar(x, y, ev) {
    imaVisto = null;
    if (ev && ev.shiftKey) return [arred(Math.round(x * 100) / 100), arred(Math.round(y * 100) / 100)];
    const lim = 10 / vista.s; let best = null, bd = lim;
    const tentar = (px, py) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = [px, py]; } };
    for (const w of P.paredes) {
      tentar(w[0], w[1]); tentar(w[2], w[1]); tentar(w[0], w[3]); tentar(w[2], w[3]);
      if (eixoX(w)) { const c = (w[1] + w[3]) / 2; tentar(w[0], c); tentar(w[2], c); } else { const c = (w[0] + w[2]) / 2; tentar(c, w[1]); tentar(c, w[3]); }
    }
    for (const c of P.comodos) { tentar(c.r[0], c.r[1]); tentar(c.r[2], c.r[1]); tentar(c.r[0], c.r[3]); tentar(c.r[2], c.r[3]); }
    for (const q of [[0, 0], [P.lote.largura, 0], [0, P.lote.profundidade], [P.lote.largura, P.lote.profundidade]]) tentar(q[0], q[1]);
    if (fundo.pontos && P.referencia && P.referencia.tipo === 'dxf') for (const q of pontosDxfPerto(x, y, lim)) tentar(q[0], q[1]);
    if (best) { imaVisto = best; return best.map(arred); }
    return [Math.round(x * 20) / 20, Math.round(y * 20) / 20].map(arred);
  }
  // pontas das linhas do DXF, num índice por quadrados de 1 m (em coordenadas da planta)
  let indiceDxf = null;
  function indexarDxf() {
    indiceDxf = new Map(); const R = P.referencia; if (!R || !fundo.pontos) return;
    const ang = (R.rot || 0) * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang);
    for (let k = 0; k < fundo.pontos.length; k += 2) {      // mesma conta do transform do <g> do fundo (giro no sentido da tela)
      const lx = fundo.pontos[k] * R.escala, ly = fundo.pontos[k + 1] * R.escala;
      const px = R.x + lx * c + ly * s, py = R.y + ly * c - lx * s;
      const chave = `${Math.floor(px)}|${Math.floor(py)}`;
      (indiceDxf.get(chave) || indiceDxf.set(chave, []).get(chave)).push([px, py]);
    }
  }
  function pontosDxfPerto(x, y) {
    if (!indiceDxf) indexarDxf();
    const out = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of indiceDxf.get(`${Math.floor(x) + i}|${Math.floor(y) + j}`) || []) out.push(q);
    return out;
  }

  // ------------------------------------------------------------------ ações
  function retParede(p0, p1) {
    const t = ESP() / 2;
    if (Math.abs(p1[0] - p0[0]) >= Math.abs(p1[1] - p0[1])) {
      const y = p0[1]; return [Math.min(p0[0], p1[0]) - t, y - t, Math.max(p0[0], p1[0]) + t, y + t].map(arred);
    }
    const x = p0[0]; return [x - t, Math.min(p0[1], p1[1]) - t, x + t, Math.max(p0[1], p1[1]) + t].map(arred);
  }
  function criarParede(p0, p1) {
    const r = retParede(p0, p1), comp = Math.max(r[2] - r[0], r[3] - r[1]);
    if (comp < ESP() + 0.1) return false;
    marcar();
    if (P.paredesPelosComodos) { P.paredesPelosComodos = false; aviso('Você desenhou uma parede à mão: as paredes não acompanham mais os cômodos sozinhas.', 5000); }
    P.paredes.push([...r, []]);
    PL.limparJuntas(P.paredes);
    sel = { tipo: 'parede', i: P.paredes.length - 1 };
    depois({ paredes: false });
    return true;
  }
  function criarComodo(p0, p1) {
    const r = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1])].map(arred);
    if (r[2] - r[0] < 0.3 || r[3] - r[1] < 0.3) return;
    marcar();
    let n = P.comodos.length + 1; while (P.comodos.some(c => c.id === 'c' + n)) n++;
    P.comodos.push({ id: 'c' + n, nome: 'Cômodo ' + n, r, interno: true });
    sel = { tipo: 'comodo', i: P.comodos.length - 1 };
    abrirAba('sel'); depois();
    const campo = document.querySelector('[data-painel="sel"] input'); if (campo) { campo.focus(); campo.select(); }
  }
  function lugarDaAbertura(i, tipo, x, y) {
    const w = P.paredes[i], ax = eixoX(w), s0 = ax ? w[0] : w[1], s1 = ax ? w[2] : w[3], u = ax ? x : y;
    const larg = Math.min(LARG_PADRAO[tipo], s1 - s0 - 0.02);
    if (larg < 0.3) return null;
    const a = arred(clamp(Math.round((u - larg / 2) * 100) / 100, s0, s1 - larg)), b = arred(a + larg);
    if (w[4].some(op => op[0] < b - 1e-6 && op[1] > a + 1e-6)) return null;
    return { a, b, r: ax ? [a, w[1], b, w[3]] : [w[0], a, w[2], b] };
  }
  function criarAbertura(i, tipo, x, y) {
    const lugar = lugarDaAbertura(i, tipo, x, y);
    if (!lugar) { aviso('Não cabe aqui: falta parede ou já tem outra abertura.'); return; }
    marcar();
    const w = P.paredes[i], H = P.peDireito, porta = tipo === 'door' || tipo === 'glass';
    const top = porta ? Math.min(P.alturaPorta || 2.1, H) : Math.min(2.1, H - 0.1), base = porta ? 0 : tipo === 'basc' ? Math.max(0, top - 0.5) : Math.max(0, top - 1.1);
    const op = [lugar.a, lugar.b, arred(base), arred(top), tipo];
    if (tipo === 'door') {
      // abre para o lado do cômodo interno (se houver)
      const ax = eixoX(w), m = (lugar.a + lugar.b) / 2, c0 = ax ? w[1] : w[0], c1 = ax ? w[3] : w[2];
      const lado = d => { const q = ax ? [m, d] : [d, m]; const r = acharComodo(q[0], q[1]); return r && P.comodos[r.i].interno; };
      op.push({ dob: 'a', lado: lado(c1 + 0.3) || !lado(c0 - 0.3) ? 1 : -1 });
    }
    w[4].push(op); w[4].sort((p, q) => p[0] - q[0]);
    sel = { tipo: 'abertura', i, j: w[4].indexOf(op) };
    abrirAba('sel'); depois({ paredes: false });
  }
  function apagarSel() {
    if (!sel || !podeEditar) return;
    marcar();
    if (sel.tipo === 'comodo') P.comodos.splice(sel.i, 1);
    else if (sel.tipo === 'parede') { if (P.paredesPelosComodos) { P.paredesPelosComodos = false; aviso('As paredes não acompanham mais os cômodos sozinhas.'); } P.paredes.splice(sel.i, 1); }
    else if (sel.tipo === 'abertura') P.paredes[sel.i][4].splice(sel.j, 1);
    const eraComodo = sel.tipo === 'comodo'; sel = null; depois({ paredes: eraComodo });
  }
  function moverParede(w, orig, dx, dy) {
    const ax = eixoX(orig);
    w[0] = arred(orig[0] + dx); w[2] = arred(orig[2] + dx); w[1] = arred(orig[1] + dy); w[3] = arred(orig[3] + dy);
    const du = ax ? dx : dy;
    w[4] = orig[4].map(op => { const n = op.slice(); n[0] = arred(op[0] + du); n[1] = arred(op[1] + du); return n; });
  }

  // ------------------------------------------------------------------ ponteiro
  function posEvento(e) { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  svg.addEventListener('pointerdown', e => {
    svg.setPointerCapture(e.pointerId);
    const [sx, sy] = posEvento(e), [x, y] = mundo(sx, sy);
    toques.set(e.pointerId, [sx, sy]);
    if (toques.size === 2) { const [p, q] = [...toques.values()]; arraste = { tipo: 'pinca', d: Math.hypot(p[0] - q[0], p[1] - q[1]), s: vista.s, c: mundo((p[0] + q[0]) / 2, (p[1] + q[1]) / 2) }; return; }
    if (e.button === 1 || e.button === 2) { arraste = { tipo: 'pan', sx, sy, ox: vista.ox, oy: vista.oy }; return; }
    if (e.button !== 0) return;
    if (calib) { cliqueCalibrar(x, y); return; }
    if (moverFundo && P.referencia) { arraste = { tipo: 'fundo', x, y, rx: P.referencia.x, ry: P.referencia.y, antes: JSON.stringify(P) }; return; }
    if (!podeEditar || ferramenta === 'selecionar') {
      const h = acharQualquer(x, y);
      sel = h; montarPaineis(); if (h) abrirAba('sel');
      if (h && podeEditar) {
        const o = objetoSel();
        arraste = { tipo: 'mover', x, y, sx, sy, antes: JSON.stringify(P), orig: JSON.parse(JSON.stringify(o)), andou: false };
      } else arraste = { tipo: 'pan', sx, sy, ox: vista.ox, oy: vista.oy };
      pedirDesenho(); return;
    }
    const p = encaixar(x, y, e);
    if (ferramenta === 'comodo') { arraste = { tipo: 'comodo', p0: p }; return; }
    if (ferramenta === 'parede') {
      if (!parede0) { parede0 = p; return; }
      if (criarParede(parede0, p)) parede0 = Math.abs(p[0] - parede0[0]) >= Math.abs(p[1] - parede0[1]) ? [p[0], parede0[1]] : [parede0[0], p[1]];
      return;
    }
    if (['door', 'win', 'glass', 'basc'].includes(ferramenta)) { const h = acharParede(x, y); if (h) criarAbertura(h.i, ferramenta, x, y); else aviso('Clique em cima de uma parede.'); return; }
    if (ferramenta === 'entrada') { marcar(); P.entrada = { x: arred(x), y: arred(y), rumo: P.entrada ? P.entrada.rumo : 0 }; depois({ paredes: false }); }
  });
  svg.addEventListener('pointermove', e => {
    const [sx, sy] = posEvento(e), [x, y] = mundo(sx, sy);
    if (toques.has(e.pointerId)) toques.set(e.pointerId, [sx, sy]);
    mouse = [x, y];
    $('coord').textContent = `x ${mm2(x)}  y ${mm2(y)} m`;
    if (arraste && arraste.tipo === 'pinca' && toques.size === 2) {
      const [p, q] = [...toques.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      zoomEm(arraste.c, clamp(arraste.s * d / arraste.d, 2, 400), ((p[0] + q[0]) / 2), ((p[1] + q[1]) / 2)); return;
    }
    if (arraste && arraste.tipo === 'pan') { vista.ox = arraste.ox - (sx - arraste.sx) / vista.s; vista.oy = arraste.oy + (sy - arraste.sy) / vista.s; pedirDesenho(); return; }
    if (arraste && arraste.tipo === 'fundo') { P.referencia.x = arred(arraste.rx + x - arraste.x); P.referencia.y = arred(arraste.ry + y - arraste.y); indiceDxf = null; mudou = true; pedirDesenho(); return; }
    if (arraste && arraste.tipo === 'mover') {
      if (!arraste.andou && Math.hypot(sx - arraste.sx, sy - arraste.sy) < 4) return;
      arraste.andou = true;
      let dx = x - arraste.x, dy = y - arraste.y;
      if (!e.shiftKey) { dx = Math.round(dx * 20) / 20; dy = Math.round(dy * 20) / 20; } else { dx = Math.round(dx * 100) / 100; dy = Math.round(dy * 100) / 100; }
      const o = objetoSel(), orig = arraste.orig;
      if (sel.tipo === 'comodo') { o.r = [orig.r[0] + dx, orig.r[1] + dy, orig.r[2] + dx, orig.r[3] + dy].map(arred); if (P.paredesPelosComodos) P.paredes = PL.paredesDosComodos(P.comodos, ESP(), JSON.parse(arraste.antes).paredes); }
      else if (sel.tipo === 'parede') moverParede(o, orig, dx, dy);
      else if (sel.tipo === 'abertura') {
        const w = P.paredes[sel.i], ax = eixoX(w), s0 = ax ? w[0] : w[1], s1 = ax ? w[2] : w[3], L = orig[1] - orig[0];
        let a = clamp(orig[0] + (ax ? dx : dy), s0, s1 - L);
        if (w[4].some((op, j) => j !== sel.j && op[0] < a + L - 1e-6 && op[1] > a + 1e-6)) return;
        o[0] = arred(a); o[1] = arred(a + L);
      }
      PL.derivar(P); pedirDesenho(); return;
    }
    if (arraste && arraste.tipo === 'comodo') { const p = encaixar(x, y, e), q = arraste.p0; fantasma = [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; pedirDesenho(); return; }
    // pré-visualização
    fantasma = null; imaVisto = null;
    if (podeEditar && ferramenta === 'parede') { const p = encaixar(x, y, e); if (parede0) fantasma = retParede(parede0, p); }
    else if (podeEditar && ['door', 'win', 'glass', 'basc'].includes(ferramenta)) { const h = acharParede(x, y); const l = h && lugarDaAbertura(h.i, ferramenta, x, y); if (l) fantasma = l.r; }
    else if (podeEditar && ferramenta === 'comodo') encaixar(x, y, e);
    pedirDesenho();
  });
  function fimArraste(e) {
    toques.delete(e.pointerId);
    if (!arraste) return;
    const a = arraste; arraste = null;
    if (a.tipo === 'comodo' && fantasma) { const f = fantasma; fantasma = null; criarComodo([f[0], f[1]], [f[2], f[3]]); return; }
    if (a.tipo === 'mover' && a.andou) {
      pilhaDesfazer.push(a.antes); pilhaRefazer.length = 0; mudou = true;
      depois({ paredes: sel && sel.tipo === 'comodo' }); return;
    }
    if (a.tipo === 'fundo') { pilhaDesfazer.push(a.antes); pilhaRefazer.length = 0; mudou = true; atualizarEstado(); montarPaineis(); }
    fantasma = null; pedirDesenho();
  }
  svg.addEventListener('pointerup', fimArraste);
  svg.addEventListener('pointercancel', fimArraste);
  svg.addEventListener('contextmenu', e => e.preventDefault());
  svg.addEventListener('dblclick', () => { parede0 = null; fantasma = null; pedirDesenho(); });
  function zoomEm(c, s, sx, sy) { vista.s = s; vista.ox = c[0] - sx / s; vista.oy = c[1] + sy / s; pedirDesenho(); }
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const [sx, sy] = posEvento(e), c = mundo(sx, sy);
    zoomEm(c, clamp(vista.s * Math.pow(1.0015, -e.deltaY * (e.deltaMode === 1 ? 30 : 1)), 2, 400), sx, sy);
  }, { passive: false });
  new ResizeObserver(() => pedirDesenho()).observe(svg);

  // ------------------------------------------------------------------ teclado e ferramentas
  const DICAS = {
    selecionar: 'Clique para escolher; arraste para mover (Shift: passos de 1 cm). Arraste o fundo vazio para andar pela planta; a roda do mouse aproxima.',
    comodo: 'Arraste um retângulo para criar um cômodo. Depois ajuste nome e medidas internas no painel.',
    parede: 'Clique no começo e depois no fim da parede (sempre reta, na horizontal ou vertical). Continua a partir do fim; Esc ou clique duplo termina. Shift: sem ímã.',
    door: 'Clique numa parede para pôr uma porta de 80 cm.', win: 'Clique numa parede para pôr uma janela de 120 cm.',
    glass: 'Clique numa parede para pôr uma porta de vidro de correr de 160 cm.', basc: 'Clique numa parede para pôr um basculante de 60 cm.',
    entrada: 'Clique onde você quer começar ao entrar no modo Caminhar do 3D.',
  };
  function usarFerramenta(f) {
    ferramenta = f; parede0 = null; fantasma = null; calib = null;
    for (const b of document.querySelectorAll('#ferramentas [data-f]')) b.setAttribute('aria-pressed', String(b.dataset.f === f));
    $('dica').textContent = DICAS[f] || '';
    svg.style.cursor = f === 'selecionar' ? 'default' : 'crosshair';
    pedirDesenho();
  }
  for (const b of document.querySelectorAll('#ferramentas [data-f]')) b.onclick = () => usarFerramenta(b.dataset.f);
  $('bEnquadrar').onclick = enquadrar;
  document.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea,select')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) refazer(); else desfazer(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); refazer(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); salvar(); return; }
    if (e.key === 'Escape') { if (calib) { calib = null; montarPaineis(); } parede0 = null; fantasma = null; arraste = null; if (ferramenta !== 'selecionar') usarFerramenta('selecionar'); else { sel = null; montarPaineis(); } pedirDesenho(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); apagarSel(); return; }
    if (e.key === 'Home') { enquadrar(); return; }
    if (e.key.startsWith('Arrow') && sel && podeEditar) {
      e.preventDefault();
      const d = e.shiftKey ? 0.1 : 0.01, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowDown' ? -d : e.key === 'ArrowUp' ? d : 0;
      marcar(); const o = objetoSel();
      if (sel.tipo === 'comodo') o.r = [o.r[0] + dx, o.r[1] + dy, o.r[2] + dx, o.r[3] + dy].map(arred);
      else if (sel.tipo === 'parede') moverParede(o, JSON.parse(JSON.stringify(o)), dx, dy);
      else { const w = P.paredes[sel.i], ax = eixoX(w), du = ax ? dx : dy, s0 = ax ? w[0] : w[1], s1 = ax ? w[2] : w[3]; if (o[0] + du >= s0 && o[1] + du <= s1) { o[0] = arred(o[0] + du); o[1] = arred(o[1] + du); } }
      depois({ paredes: sel.tipo === 'comodo' }); return;
    }
    if (!podeEditar || e.ctrlKey || e.metaKey || e.altKey) return;
    const atalho = { v: 'selecionar', c: 'comodo', p: 'parede', d: 'door', j: 'win' }[k];
    if (atalho) usarFerramenta(atalho);
  });

  // ------------------------------------------------------------------ painéis
  function abrirAba(a) {
    for (const b of document.querySelectorAll('.abas [data-aba]')) b.setAttribute('aria-selected', String(b.dataset.aba === a));
    for (const p of document.querySelectorAll('[data-painel]')) p.hidden = p.dataset.painel !== a;
  }
  for (const b of document.querySelectorAll('.abas [data-aba]')) b.onclick = () => abrirAba(b.dataset.aba);

  // campo numérico em cm (ou m) ligado a um valor da planta
  function campoNum(rotulo, valor, aoMudar, { unidade = 'cm', min = 0, max = 100000, passo } = {}) {
    const fator = unidade === 'm' ? 1 : 100;
    const inp = el('input', { type: 'number', value: String(Math.round(valor * fator * 100) / 100), min, max, step: passo || (unidade === 'm' ? 0.01 : 1), disabled: !podeEditar, inputMode: 'decimal' });
    inp.addEventListener('change', () => {
      const v = Number(inp.value);
      if (!Number.isFinite(v) || v < min || v > max) { aviso(`Valor fora do permitido (${min} a ${max} ${unidade}).`); inp.value = String(Math.round(valor * fator * 100) / 100); return; }
      marcar(); aoMudar(arred(v / fator)); depois(aoMudar.opcoes || {});
    });
    return el('label', { class: 'campo' }, `${rotulo} (${unidade})`, inp);
  }
  function campoTexto(rotulo, valor, aoMudar, max = 60) {
    const inp = el('input', { value: valor || '', maxLength: max, disabled: !podeEditar });
    inp.addEventListener('change', () => { marcar(); aoMudar(inp.value.trim()); depois({ paredes: false }); });
    return el('label', { class: 'campo' }, rotulo, inp);
  }
  function marca(rotulo, ligado, aoMudar) {
    const inp = el('input', { type: 'checkbox', checked: !!ligado, disabled: !podeEditar });
    inp.addEventListener('change', () => { marcar(); aoMudar(inp.checked); depois(); });
    return el('label', { class: 'marca' }, inp, rotulo);
  }
  function escolha(rotulo, valor, opcoes, aoMudar) {
    const s = el('select', { disabled: !podeEditar }, opcoes.map(([v, t]) => el('option', { value: v, texto: t, selected: v === valor })));
    s.addEventListener('change', () => { marcar(); aoMudar(s.value); depois(); });
    return el('label', { class: 'campo' }, rotulo, s);
  }
  const botao = (texto, fn, cls = 'btn pequeno') => el('button', { class: cls, type: 'button', texto, onclick: fn, disabled: !podeEditar });

  function montarPaineis() {
    if (!P) return;
    montarSel(); montarComodos(); montarTerreno(); montarFundo();
  }

  function montarSel() {
    const box = document.querySelector('[data-painel="sel"]'), o = objetoSel();
    box.replaceChildren();
    if (!o) {
      add(box, el('section', {},
        el('h2', { texto: 'Como montar a planta' }),
        el('ol', { class: 'nota', style: 'padding-left:18px;margin:0' },
          el('li', { texto: 'Em Terreno, confira a largura e a profundidade do lote.' }),
          el('li', { texto: 'Crie os cômodos com as medidas internas (ferramenta Cômodo ou aba Cômodos). As paredes aparecem em volta sozinhas.' }),
          el('li', { texto: 'Ou envie a imagem, o PDF ou o DXF da planta em Planta de fundo e desenhe por cima. O Claude também pode ler a imagem e montar um rascunho.' }),
          el('li', { texto: 'Coloque portas e janelas clicando nas paredes.' }),
          el('li', { texto: 'Salve e clique em Ver em 3D.' })),
        el('p', { class: 'nota', style: 'margin-top:10px', texto: 'Coordenadas: x vai da esquerda para a direita olhando da rua; y vai da rua para o fundo. O canto da frente-esquerda do terreno é 0, 0.' })));
      return;
    }
    const sec = el('section', {});
    if (sel.tipo === 'comodo') {
      const c = o, [a, b, cc, d] = c.r;
      add(sec, el('h2', { texto: 'Cômodo' }),
        campoTexto('Nome', c.nome, v => { c.nome = v || 'Cômodo'; }),
        el('div', { class: 'grade2' },
          campoNum('Largura interna', cc - a, v => { c.r[2] = arred(c.r[0] + Math.max(0.3, v)); }, { min: 30, max: 30000 }),
          campoNum('Profundidade interna', d - b, v => { c.r[3] = arred(c.r[1] + Math.max(0.3, v)); }, { min: 30, max: 30000 }),
          campoNum('Distância da esquerda (x)', a, v => { const L = c.r[2] - c.r[0]; c.r[0] = v; c.r[2] = arred(v + L); }, { min: -1000, max: 30000 }),
          campoNum('Distância da rua (y)', b, v => { const L = c.r[3] - c.r[1]; c.r[1] = v; c.r[3] = arred(v + L); }, { min: -1000, max: 30000 })),
        marca('Dentro de casa (piso, forro, rodapé e luz)', c.interno, v => { if (v) c.interno = true; else delete c.interno; }),
        c.interno ? marca('Parede com azulejo (banheiro, cozinha)', c.parede === 'azulejo', v => { if (v) c.parede = 'azulejo'; else delete c.parede; })
          : el('div', {}, marca('Piso de cimento ou cerâmica', c.piso === 'cimento', v => { if (v) c.piso = 'cimento'; else delete c.piso; }),
            marca('Coberto (tem forro e luz)', c.coberto, v => { if (v) c.coberto = true; else delete c.coberto; })),
        marca('Nome escrito no piso', c.rotulo !== false, v => { if (v) delete c.rotulo; else c.rotulo = false; }),
        marca('Botão de atalho no 3D', c.atalho !== false, v => { if (v) delete c.atalho; else c.atalho = false; }),
        el('div', { class: 'linha' }, botao('Duplicar', () => { marcar(); const n = JSON.parse(JSON.stringify(c)); n.id = 'c' + Date.now().toString(36); n.nome += ' (cópia)'; const L = c.r[2] - c.r[0]; n.r = [c.r[2] + ESP(), c.r[1], c.r[2] + ESP() + L, c.r[3]].map(arred); P.comodos.push(n); sel = { tipo: 'comodo', i: P.comodos.length - 1 }; depois(); }),
          botao('Excluir', apagarSel, 'btn pequeno perigo')));
      if (!P.paredesPelosComodos) add(sec, el('p', { class: 'nota', style: 'margin-top:8px', texto: 'As paredes desta planta não acompanham os cômodos sozinhas. Se mudar medidas, ajuste as paredes ou use "Gerar paredes pelos cômodos" na aba Cômodos.' }));
    } else if (sel.tipo === 'parede') {
      const w = o, ax = eixoX(w);
      const comp = ax ? w[2] - w[0] : w[3] - w[1], esp = ax ? w[3] - w[1] : w[2] - w[0];
      const semAuto = f => (...args) => { if (P.paredesPelosComodos) { P.paredesPelosComodos = false; aviso('As paredes não acompanham mais os cômodos sozinhas.'); } f(...args); };
      const mudarPor = f => { const fn = semAuto(f); fn.opcoes = { paredes: false }; return fn; };
      add(sec, el('h2', { texto: `Parede ${ax ? 'horizontal' : 'vertical'}` }),
        el('p', { class: 'nota', texto: ax ? 'Vai da esquerda para a direita. Início = ponta da esquerda.' : 'Vai da rua para o fundo. Início = ponta do lado da rua.' }),
        el('div', { class: 'grade2' },
          campoNum('Comprimento', comp, mudarPor(v => { if (ax) w[2] = arred(w[0] + v); else w[3] = arred(w[1] + v); w[4] = w[4].filter(op => op[1] <= (ax ? w[2] : w[3]) + 1e-6); }), { min: 5, max: 30000 }),
          campoNum('Espessura', esp, mudarPor(v => { if (ax) { const c = (w[1] + w[3]) / 2; w[1] = arred(c - v / 2); w[3] = arred(c + v / 2); } else { const c = (w[0] + w[2]) / 2; w[0] = arred(c - v / 2); w[2] = arred(c + v / 2); } }), { min: 3, max: 60 }),
          campoNum('Início: x', w[0], mudarPor(v => moverParede(w, JSON.parse(JSON.stringify(w)), v - w[0], 0)), { min: -1000, max: 30000 }),
          campoNum('Início: y', w[1], mudarPor(v => moverParede(w, JSON.parse(JSON.stringify(w)), 0, v - w[1])), { min: -1000, max: 30000 })),
        el('h3', { texto: 'Portas e janelas desta parede' }),
        w[4].length ? el('div', { class: 'lista-ed' }, w[4].map((op, j) => el('button', { type: 'button', onclick: () => { sel = { tipo: 'abertura', i: sel.i, j }; montarPaineis(); pedirDesenho(); } },
          el('span', { texto: NOMES[op[4]] }), el('small', { texto: `${cm(op[1] - op[0])} cm, a ${cm(op[0] - (ax ? w[0] : w[1]))} cm do início` })))) : el('p', { class: 'nota', texto: 'Nenhuma. Use as ferramentas Porta ou Janela e clique na parede.' }),
        el('div', { class: 'linha', style: 'margin-top:10px' }, botao('Excluir parede', apagarSel, 'btn pequeno perigo')));
    } else {
      const w = P.paredes[sel.i], op = o, ax = eixoX(w), s0 = ax ? w[0] : w[1], s1 = ax ? w[2] : w[3], porta = op[4] === 'door' || op[4] === 'glass';
      const encaixa = (a, b) => a >= s0 - 1e-6 && b <= s1 + 1e-6 && !w[4].some(q => q !== op && q[0] < b - 1e-6 && q[1] > a + 1e-6);
      const ajustar = (a, b) => { if (!encaixa(a, b)) { aviso('Não cabe: passa da parede ou encosta em outra abertura.'); return false; } op[0] = arred(a); op[1] = arred(b); return true; };
      const semParede = f => { f.opcoes = { paredes: false }; return f; };
      add(sec, el('h2', { texto: NOMES[op[4]] }),
        escolha('Tipo', op[4], Object.entries(NOMES), v => { op[4] = v; if (v === 'door' && !op[5]) op[5] = { dob: 'a', lado: 1 }; if (v !== 'door') op.length = 5; if (v === 'door' || v === 'glass') op[2] = 0; }),
        el('div', { class: 'grade2' },
          campoNum('Largura', op[1] - op[0], semParede(v => { ajustar(op[0], op[0] + v); }), { min: 10, max: 2000 }),
          campoNum('Distância do início da parede', op[0] - s0, semParede(v => { const L = op[1] - op[0]; ajustar(s0 + v, s0 + v + L); }), { min: 0, max: 30000 }),
          porta ? null : campoNum('Peitoril (do chão)', op[2], semParede(v => { if (v < op[3] - 0.1) op[2] = v; else aviso('O peitoril precisa ficar abaixo do alto da janela.'); }), { min: 0, max: 600 }),
          campoNum(porta ? 'Altura' : 'Alto da janela (do chão)', op[3], semParede(v => { if (v > op[2] + 0.1 && v <= P.peDireito + 0.001) op[3] = v; else aviso('Altura fora do possível para o pé-direito.'); }), { min: 20, max: 600 })),
        op[4] === 'door' ? el('div', {},
          escolha('Folha da porta', op[5] && op[5].dob ? op[5].dob : '', [['a', ax ? 'Dobradiça na esquerda' : 'Dobradiça do lado da rua'], ['b', ax ? 'Dobradiça na direita' : 'Dobradiça do lado do fundo'], ['', 'Sem folha (só o vão)']], v => { op[5] = { ...(op[5] || { lado: 1 }), dob: v || null }; }),
          escolha('Abre para', String(op[5] && op[5].lado === -1 ? -1 : 1), [['1', ax ? 'O lado do fundo' : 'O lado direito'], ['-1', ax ? 'O lado da rua' : 'O lado esquerdo']], v => { op[5] = { ...(op[5] || { dob: 'a' }), lado: Number(v) }; })) : null,
        el('div', { class: 'linha' },
          botao('Centralizar na parede', () => { marcar(); const L = op[1] - op[0], a = (s0 + s1) / 2 - L / 2; if (ajustar(a, a + L)) depois({ paredes: false }); }),
          botao('Excluir', apagarSel, 'btn pequeno perigo')));
    }
    add(box, sec);
  }

  function montarComodos() {
    const box = document.querySelector('[data-painel="comodos"]');
    box.replaceChildren();
    const lista = el('div', { class: 'lista-ed' }, P.comodos.map((c, i) => el('button', { type: 'button', class: sel && sel.tipo === 'comodo' && sel.i === i ? 'sel' : '', onclick: () => { sel = { tipo: 'comodo', i }; abrirAba('sel'); montarPaineis(); pedirDesenho(); } },
      el('span', { texto: c.nome }), el('small', { texto: `${mm2(c.r[2] - c.r[0])} × ${mm2(c.r[3] - c.r[1])} m${c.interno ? '' : ' · fora'}` }))));
    add(box, el('section', {}, el('h2', { texto: 'Cômodos' }),
      P.comodos.length ? lista : el('p', { class: 'nota', texto: 'Nenhum cômodo ainda.' }),
      el('div', { class: 'linha', style: 'margin-top:10px' }, botao('Adicionar cômodo', () => {
        const ult = P.comodos[P.comodos.length - 1], x0 = ult ? ult.r[2] + ESP() : 1, y0 = ult ? ult.r[1] : 5;
        criarComodo([x0, y0], [x0 + 3, y0 + 3]);
      }, 'btn pequeno primario'))));
    add(box, el('section', {}, el('h2', { texto: 'Paredes' }),
      el('p', { class: 'nota', texto: `${P.paredes.length} ${P.paredes.length === 1 ? 'parede' : 'paredes'}.` }),
      marca('Paredes acompanham os cômodos (em volta dos cômodos de dentro de casa)', P.paredesPelosComodos, v => { if (v) { P.paredesPelosComodos = true; } else delete P.paredesPelosComodos; }),
      campoNum('Espessura das paredes', ESP(), v => { P.espessura = v; }, { min: 5, max: 60 }),
      el('p', { class: 'nota', texto: 'Com a opção ligada, mudar um cômodo refaz as paredes; portas e janelas ficam onde estavam se ainda couberem.' }),
      el('div', { class: 'linha' }, botao('Gerar paredes pelos cômodos agora', () => {
        if (P.paredes.length && !confirm('Trocar as paredes atuais por paredes em volta dos cômodos de dentro de casa? Portas e janelas são mantidas quando couberem.')) return;
        marcar(); P.paredes = PL.paredesDosComodos(P.comodos, ESP(), P.paredes); depois({ paredes: false });
      }))));
  }

  function montarTerreno() {
    const box = document.querySelector('[data-painel="terreno"]');
    box.replaceChildren();
    const sem = f => { f.opcoes = { paredes: false }; return f; };
    const T = P.telhado;
    add(box, 
      el('section', {}, el('h2', { texto: 'Terreno' }),
        el('div', { class: 'grade2' },
          campoNum('Largura (frente)', P.lote.largura, sem(v => { P.lote.largura = v; }), { unidade: 'm', min: 2, max: 200 }),
          campoNum('Profundidade', P.lote.profundidade, sem(v => { P.lote.profundidade = v; }), { unidade: 'm', min: 2, max: 300 }),
          campoNum('Pé-direito', P.peDireito, sem(v => { P.peDireito = v; }), { min: 200, max: 600 }),
          campoNum('Altura das portas', P.alturaPorta || 2.1, sem(v => { P.alturaPorta = v; }), { min: 150, max: 400 })),
        P.auto ? el('div', {},
          el('h3', { texto: 'Muros' }),
          marca('Muro nas laterais', P.terreno.muroLaterais, v => { P.terreno.muroLaterais = v; }),
          marca('Muro no fundo', P.terreno.muroFundo, v => { P.terreno.muroFundo = v; }),
          marca('Muro na frente (com vão do portão)', P.terreno.muroFrente, v => { P.terreno.muroFrente = v; }),
          campoNum('Altura do muro', P.alturaMuro, sem(v => { P.alturaMuro = v; }), { min: 0, max: 500 }))
          : el('div', {}, el('p', { class: 'nota', texto: 'Muros, pisos externos, forros e luzes desta planta foram desenhados à mão.' }),
            botao('Passar a gerar sozinho pelos cômodos', () => {
              if (!confirm('Os muros, os pisos de fora, os forros e as luzes passam a ser gerados pelos cômodos e pelas opções desta aba. Continuar?')) return;
              marcar(); P.auto = true; P.terreno = { muroLaterais: true, muroFundo: true, muroFrente: false }; depois({ paredes: false });
            })),
        el('h3', { texto: 'Portão' }),
        marca('Tem portão de grade na frente', !!P.portao, v => { P.portao = v ? [0, Math.min(4, P.lote.largura)] : null; }),
        P.portao ? el('div', { class: 'grade2' },
          campoNum('Começa em x', P.portao[0], sem(v => { P.portao[0] = Math.min(v, P.portao[1] - 0.3); }), { min: 0, max: 20000 }),
          campoNum('Termina em x', P.portao[1], sem(v => { P.portao[1] = Math.max(v, P.portao[0] + 0.3); }), { min: 0, max: 20000 })) : null),
      el('section', {}, el('h2', { texto: 'Telhado' }),
        escolha('Tipo', T ? 'duas' : 'nenhum', [['nenhum', 'Sem telhado (laje ou não quero ver)'], ['duas', 'Duas águas (cumeeira de um lado ao outro)']], v => { P.telhado = v === 'duas' ? telhadoAjustado() : null; }),
        T ? el('div', {},
          el('div', { class: 'grade2' },
            campoNum('Frente do telhado (y)', T.frente, sem(v => { T.frente = v; }), { min: -1000, max: 30000 }),
            campoNum('Fundo do telhado (y)', T.fundo, sem(v => { T.fundo = v; }), { min: -1000, max: 30000 }),
            campoNum('Cumeeira (y)', T.cumeeira, sem(v => { T.cumeeira = v; }), { min: -1000, max: 30000 }),
            campoNum('Altura na beirada', T.beiral, sem(v => { T.beiral = v; }), { min: 150, max: 1200 }),
            campoNum('Começa em x', T.x0, sem(v => { T.x0 = v; }), { min: -1000, max: 30000 }),
            campoNum('Termina em x', T.x1, sem(v => { T.x1 = v; }), { min: -1000, max: 30000 }),
            campoNum('Inclinação', T.inclinacao, sem(v => { T.inclinacao = clamp(v, 0.02, 1.5); }), { unidade: '%', min: 2, max: 150 })),
          botao('Ajustar à casa', () => { marcar(); P.telhado = telhadoAjustado(); depois({ paredes: false }); })) : null),
      el('section', {}, el('h2', { texto: 'Em volta' }),
        escolha('Vizinhança no 3D', P.vizinhanca, [['nenhuma', 'Só a rua'], ['geminadas', 'Casas iguais dos lados (geminadas)']], v => { P.vizinhanca = v; }),
        el('div', { class: 'grade2' },
          campoTexto('Lado esquerdo (nome)', P.lados.esquerda, v => { if (v) P.lados.esquerda = v; else delete P.lados.esquerda; }),
          campoTexto('Lado direito (nome)', P.lados.direita, v => { if (v) P.lados.direita = v; else delete P.lados.direita; })),
        el('p', { class: 'nota', texto: 'Os nomes dos lados aparecem no ajuste do sol (ex.: "garagem e quartos").' })));
  }
  function telhadoAjustado() {
    const ps = P.paredes; const H = P.peDireito;
    if (!ps.length) return { x0: 0, x1: P.lote.largura, frente: 2, fundo: Math.min(P.lote.profundidade - 1, 14), cumeeira: 8, beiral: arred(H + 0.12), inclinacao: 0.25 };
    const x0 = Math.min(...ps.map(w => w[0])), x1 = Math.max(...ps.map(w => w[2])), y0 = Math.min(...ps.map(w => w[1])), y1 = Math.max(...ps.map(w => w[3]));
    return { x0: arred(x0), x1: arred(x1), frente: arred(y0 - 0.3), fundo: arred(y1 + 0.3), cumeeira: arred((y0 + y1) / 2), beiral: arred(H + 0.12), inclinacao: 0.25 };
  }

  // ------------------------------------------------------------------ planta de fundo
  function montarFundo() {
    const box = document.querySelector('[data-painel="fundo"]');
    box.replaceChildren();
    const R = P.referencia;
    const enviar = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,application/pdf,.pdf,.dxf', hidden: true });
    enviar.onchange = () => { const f = enviar.files[0]; enviar.value = ''; if (f) receberArquivo(f).catch(e => aviso(e.message, 6000)); };
    add(box, enviar);
    add(box, el('section', {}, el('h2', { texto: 'Planta de fundo' }),
      el('p', { class: 'nota', texto: 'Envie a planta do arquivo do arquiteto para desenhar por cima: imagem (PNG, JPG), PDF ou DXF (o AutoCAD exporta em DXF; DWG não é aceito).' }),
      el('div', { class: 'linha' }, botao(R ? 'Trocar o fundo' : 'Enviar imagem, PDF ou DXF', () => enviar.click(), 'btn pequeno primario'))));
    if (!R) return;
    const sec = el('section', {});
    const op = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: R.opacidade });
    op.oninput = () => { R.opacidade = Number(op.value); mudou = true; atualizarEstado(); pedirDesenho(); };
    add(sec, el('h3', { texto: R.nome || (R.tipo === 'dxf' ? 'Desenho DXF' : 'Imagem') }), el('label', { class: 'campo' }, 'Transparência', op));
    if (R.tipo === 'imagem') {
      add(sec, el('p', { class: 'nota', texto: fundo.w ? `Escala atual: 1 m = ${Math.round(1 / R.escala)} pixels da imagem.` : 'Carregando…' }),
        el('div', { class: 'linha' },
          el('button', { class: 'btn pequeno' + (calib ? ' primario' : ''), type: 'button', disabled: !podeEditar, texto: calib ? 'Clique em dois pontos…' : 'Calibrar a escala', onclick: () => {
            calib = calib ? null : { a: null, b: null }; montarPaineis(); pedirDesenho();
            if (calib) aviso('Clique em dois pontos da imagem cuja distância você conhece (por exemplo, as pontas de uma cota).', 6000);
          } })));
    } else {
      const unid = el('select', { disabled: !podeEditar }, [[0.001, 'milímetros'], [0.01, 'centímetros'], [1, 'metros'], [0.0254, 'polegadas']].map(([v, t]) => el('option', { value: v, texto: t, selected: Math.abs(R.escala - v) < 1e-9 })));
      unid.onchange = () => { marcar(); R.escala = Number(unid.value); indiceDxf = null; depois({ paredes: false }); };
      add(sec, el('label', { class: 'campo' }, 'O desenho está em', unid));
    }
    add(sec, el('div', { class: 'linha', style: 'margin-top:8px' },
      el('button', { class: 'btn pequeno', type: 'button', disabled: !podeEditar, 'aria-pressed': String(moverFundo), texto: moverFundo ? 'Pronto (parar de mover)' : 'Mover o fundo', onclick: () => { moverFundo = !moverFundo; montarPaineis(); } }),
      botao('Girar 90°', () => { marcar(); R.rot = ((R.rot || 0) + 90) % 360; indiceDxf = null; depois({ paredes: false }); }),
      botao('Tirar o fundo', () => { marcar(); delete P.referencia; fundo.url = null; fundo.linhas = null; fundo.pontos = null; depois({ paredes: false }); }, 'btn pequeno perigo')));
    add(sec, el('div', { class: 'grade2', style: 'margin-top:10px' },
      campoNum('Posição x', R.x, v => { R.x = v; indiceDxf = null; }, { min: -100000, max: 100000 }),
      campoNum('Posição y', R.y, v => { R.y = v; indiceDxf = null; }, { min: -100000, max: 100000 })));
    add(box, sec);
    if (R.tipo === 'imagem' && eu && eu.claude) {
      const obs = el('textarea', { rows: 2, maxLength: 1000, placeholder: 'Opcional: ex. "a rua fica do lado direito da imagem"', disabled: !podeEditar });
      const ir = botao('Ler a planta com o Claude', () => lerComClaude(obs.value, ir), 'btn pequeno primario');
      add(box, el('section', {}, el('h2', { texto: 'Leitura automática' }),
        el('p', { class: 'nota', texto: 'O Claude lê as cotas da imagem e monta um rascunho com cômodos, paredes, portas e janelas. Confira as medidas depois: é um ponto de partida. Leva de um a três minutos.' }),
        el('label', { class: 'campo' }, 'Observação para o Claude', obs), ir));
    }
  }

  function cliqueCalibrar(x, y) {
    if (!calib.a) { calib.a = [x, y]; pedirDesenho(); return; }
    calib.b = [x, y]; pedirDesenho();
    const d = Math.hypot(calib.b[0] - calib.a[0], calib.b[1] - calib.a[1]);
    setTimeout(() => {
      const txt = prompt('Qual é a distância real entre os dois pontos, em centímetros?', String(Math.round(d * 100)));
      const real = Number(String(txt || '').replace(',', '.')) / 100;
      if (txt != null && real > 0 && d > 1e-6) {
        marcar();
        const R = P.referencia, k = real / d;
        // o primeiro ponto fica parado: a imagem cresce ou encolhe em volta dele
        R.x = arred(calib.a[0] - (calib.a[0] - R.x) * k); R.y = arred(calib.a[1] - (calib.a[1] - R.y) * k);
        R.escala = R.escala * k;
        aviso('Escala ajustada. Use "Mover o fundo" para alinhar a planta com o terreno.', 5000);
        depois({ paredes: false });
      }
      calib = null; montarPaineis(); pedirDesenho();
    }, 30);
  }

  async function receberArquivo(f) {
    if (!podeEditar) return;
    const nomeArq = f.name.slice(0, 120);
    if (/\.dxf$/i.test(f.name)) return receberDxf(f, nomeArq);
    let blob = f, escala = null;
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) ({ blob, escala } = await pdfParaImagem(f));
    else blob = await reduzirImagem(f);
    aviso('Enviando…', 20000);
    const r = await api('POST', `/api/projetos/${ID}/referencias`, blob, { headers: { 'X-Nome': encodeURIComponent(nomeArq) } });
    const dims = await tamanhoImagem(blob);
    marcar();
    P.referencia = { id: r.id, tipo: 'imagem', nome: nomeArq, x: 0, y: 0, escala: escala || P.lote.largura / dims.w, opacidade: 0.55, rot: 0 };
    P.referencia.y = arred(dims.h * P.referencia.escala);         // canto de cima-esquerda: a imagem começa na frente do lote
    await carregarFundo();
    aviso(escala ? 'Planta enviada na escala do desenho. Confira com "Calibrar a escala" se precisar.' : 'Planta enviada. Agora calibre a escala: clique em dois pontos com medida conhecida.', 6000);
    depois({ paredes: false }); abrirAba('fundo');
  }
  function tamanhoImagem(blob) {
    return new Promise((ok, falha) => { const im = new Image(); const u = URL.createObjectURL(blob); im.onload = () => { ok({ w: im.naturalWidth, h: im.naturalHeight }); URL.revokeObjectURL(u); }; im.onerror = () => falha(new Error('Não consegui abrir a imagem.')); im.src = u; });
  }
  async function reduzirImagem(f) {
    const { w, h } = await tamanhoImagem(f);
    if (f.size < 4.5e6 && Math.max(w, h) <= 4000) return f;
    const k = Math.min(1, 4000 / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    const im = await createImageBitmap(f); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return paraBlobPequeno(c);
  }
  async function paraBlobPequeno(c) {
    const png = await new Promise(ok => c.toBlob(ok, 'image/png'));
    if (png && png.size < 4.5e6) return png;
    return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.88));
  }
  async function pdfParaImagem(f) {
    aviso('Abrindo o PDF…', 20000);
    const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false, enableScripting: false }).promise;
    let pag = 1;
    if (doc.numPages > 1) { pag = Number(prompt(`O PDF tem ${doc.numPages} páginas. Qual página tem a planta baixa?`, '1')) || 1; pag = clamp(Math.round(pag), 1, doc.numPages); }
    const escalaTxt = prompt('Qual é a escala do desenho? (ex.: 50 para 1:50, 100 para 1:100). Deixe em branco se não souber: depois você calibra.', '');
    const denom = Number(String(escalaTxt || '').replace(/^1\s*:\s*/, '').replace(',', '.'));
    const page = await doc.getPage(pag), v1 = page.getViewport({ scale: 1 });
    const k = Math.min(6, 3000 / Math.max(v1.width, v1.height)), vp = page.getViewport({ scale: k });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvas: c, viewport: vp, background: '#ffffff' }).promise;
    // pontos do PDF (1/72 polegada) → metros reais na escala do desenho
    const escala = denom > 0 && denom < 10000 ? (0.0254 / 72) * denom / k : null;
    return { blob: await paraBlobPequeno(c), escala };
  }
  async function receberDxf(f, nomeArq) {
    if (!window.DxfParser) throw new Error('O leitor de DXF não carregou. Recarregue a página.');
    aviso('Lendo o DXF…', 20000);
    const dxf = new window.DxfParser().parseSync(await f.text());
    const linhas = [];
    const add = (x1, y1, x2, y2) => { if (linhas.length < 300000 && [x1, y1, x2, y2].every(Number.isFinite)) linhas.push([x1, y1, x2, y2]); };
    const arco = (cx, cy, r, a0, a1, T) => { let d = a1 - a0; if (d <= 0) d += Math.PI * 2; const n = Math.max(6, Math.ceil(d / 0.2)); let p = T(cx + r * Math.cos(a0), cy + r * Math.sin(a0)); for (let i = 1; i <= n; i++) { const a = a0 + d * i / n, q = T(cx + r * Math.cos(a), cy + r * Math.sin(a)); add(p[0], p[1], q[0], q[1]); p = q; } };
    function entidades(lista, T, prof) {
      for (const e of lista || []) {
        if (e.type === 'LINE' && e.vertices && e.vertices.length >= 2) { const a = T(e.vertices[0].x, e.vertices[0].y), b = T(e.vertices[1].x, e.vertices[1].y); add(a[0], a[1], b[0], b[1]); }
        else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices) {
          const vs = e.vertices.map(v => T(v.x, v.y));
          for (let i = 1; i < vs.length; i++) add(vs[i - 1][0], vs[i - 1][1], vs[i][0], vs[i][1]);
          if (e.shape || e.closed) add(vs[vs.length - 1][0], vs[vs.length - 1][1], vs[0][0], vs[0][1]);
        } else if (e.type === 'ARC' && e.center) arco(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle, T);
        else if (e.type === 'CIRCLE' && e.center) arco(e.center.x, e.center.y, e.radius, 0, Math.PI * 2, T);
        else if (e.type === 'INSERT' && prof < 3 && dxf.blocks && dxf.blocks[e.name]) {
          const bl = dxf.blocks[e.name], sx = e.xScale || 1, sy = e.yScale || 1, ang = (e.rotation || 0) * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang);
          const bx = bl.position ? bl.position.x : 0, by = bl.position ? bl.position.y : 0, px = e.position.x, py = e.position.y;
          entidades(bl.entities, (x, y) => { const lx = (x - bx) * sx, ly = (y - by) * sy; return T(px + lx * c - ly * s, py + lx * s + ly * c); }, prof + 1);
        }
      }
    }
    entidades(dxf.entities, (x, y) => [x, y], 0);
    if (!linhas.length) throw new Error('Não achei linhas nesse DXF.');
    const xs = linhas.flatMap(l => [l[0], l[2]]), ys = linhas.flatMap(l => [l[1], l[3]]);
    const mx = Math.min(...xs), my = Math.min(...ys);
    const rel = linhas.map(l => [l[0] - mx, l[1] - my, l[2] - mx, l[3] - my]);
    const U = { 1: 0.0254, 4: 0.001, 5: 0.01, 6: 1 }[dxf.header && dxf.header.$INSUNITS];
    const larg = Math.max(...xs) - mx, escala = U || (larg > 1000 ? 0.001 : larg > 100 ? 0.01 : 1);
    aviso('Enviando…', 20000);
    const r = await api('POST', `/api/projetos/${ID}/referencias/linhas`, { linhas: rel }, { headers: { 'X-Nome': encodeURIComponent(nomeArq) } });
    marcar();
    P.referencia = { id: r.id, tipo: 'dxf', nome: nomeArq, x: 0, y: 0, escala, opacidade: 0.8, rot: 0 };
    await carregarFundo();
    aviso(`DXF enviado (${rel.length} linhas). Confira a unidade do desenho e mova o fundo para alinhar.`, 6000);
    depois({ paredes: false }); abrirAba('fundo');
  }
  async function carregarFundo() {
    const R = P.referencia;
    if (!R) { fundo.id = null; return; }
    if (fundo.id === R.id) return;
    fundo.id = R.id; fundo.url = null; fundo.linhas = null; fundo.pontos = null; indiceDxf = null;
    const url = `/api/projetos/${ID}/referencias/${R.id}`;
    try {
      if (R.tipo === 'imagem') {
        const im = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = falha; i.src = url; });
        fundo.url = url; fundo.w = im.naturalWidth; fundo.h = im.naturalHeight;
      } else {
        const { linhas } = await api('GET', url);
        fundo.linhas = linhas.map(l => `M${l[0]} ${l[1]}L${l[2]} ${l[3]}`).join('');
        fundo.pontos = new Float64Array(linhas.length * 4);
        linhas.forEach((l, i) => fundo.pontos.set(l, i * 4));
      }
    } catch { aviso('Não consegui carregar a planta de fundo.'); }
    pedirDesenho(); montarPaineis();
  }

  async function lerComClaude(observacao, botaoIr) {
    botaoIr.disabled = true; botaoIr.textContent = 'Lendo a planta… (até 3 minutos)';
    try {
      const r = await api('POST', `/api/projetos/${ID}/ler-planta`, { referencia: P.referencia.id, observacao });
      const n = r.planta.comodos.length, a = r.planta.paredes.reduce((s, w) => s + w[4].length, 0);
      const d = el('dialog', {}, el('h2', { texto: 'Rascunho do Claude' }),
        el('p', { texto: `${n} ${n === 1 ? 'cômodo' : 'cômodos'}, ${r.planta.paredes.length} paredes e ${a} portas e janelas.` }),
        r.observacoes ? el('p', { class: 'nota', texto: 'Observações: ' + r.observacoes }) : null,
        el('p', { class: 'nota', texto: 'Usar o rascunho troca os cômodos, as paredes e o terreno pelos lidos (a planta de fundo continua). Dá para desfazer.' }),
        el('div', { class: 'rodape' },
          el('button', { class: 'btn', type: 'button', texto: 'Cancelar', onclick: () => d.close() }),
          el('button', { class: 'btn primario', type: 'button', texto: 'Usar o rascunho', onclick: () => {
            marcar();
            const ref = P.referencia; P = r.planta; if (ref) P.referencia = ref;
            sel = null; d.close(); depois({ paredes: false }); enquadrar(); abrirAba('comodos');
            aviso('Rascunho aplicado. Confira as medidas de cada cômodo e as portas e janelas.', 6000);
          } })));
      d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal();
    } catch (e) { aviso(e.message, 7000); }
    finally { botaoIr.disabled = false; botaoIr.textContent = 'Ler a planta com o Claude'; }
  }

  // ------------------------------------------------------------------ salvar, versões
  async function salvar() {
    if (!podeEditar || !mudou) return true;
    $('bSalvar').disabled = true; $('estado').textContent = 'salvando…';
    try {
      const r = await api('PUT', `/api/projetos/${ID}/planta`, { planta: P, versao });
      versao = r.versao; P = r.planta; PL.inferirFolhas(P); mudou = false;
      depois({ paredes: false }); aviso('Planta salva. Quem estiver com o 3D aberto recebe um aviso para recarregar.');
      return true;
    } catch (e) {
      if (e.codigo === 'conflito') { if (confirm(e.message + '\n\nRecarregar agora? (as suas mudanças não salvas se perdem)')) { mudou = false; location.reload(); } }
      else aviso(e.message, 8000);
      atualizarEstado(); return false;
    }
  }
  $('bSalvar').onclick = salvar;
  $('bDesfazer').onclick = desfazer; $('bRefazer').onclick = refazer;
  $('b3d').onclick = async e => { if (mudou && podeEditar) { e.preventDefault(); if (await salvar()) location.href = './'; } };
  $('bVersoes').onclick = async () => {
    try {
      const vs = await api('GET', `/api/projetos/${ID}/plantas`);
      const d = el('dialog', {}, el('h2', { texto: 'Versões anteriores' }),
        el('p', { class: 'nota', texto: 'Cada vez que alguém salva, a versão anterior fica guardada aqui. Abrir uma versão coloca ela no editor; salve para voltar a ela.' }),
        vs.length ? el('div', { class: 'lista-ed' }, vs.map(v => el('button', { type: 'button', onclick: async () => {
          const r = await api('GET', `/api/projetos/${ID}/plantas/${v.id}`);
          marcar(); const ref = P.referencia; P = r.planta; if (!P.referencia && ref) P.referencia = ref; PL.inferirFolhas(P); sel = null; d.close(); depois({ paredes: false }); carregarFundo();
          aviso(`Versão ${v.versao} aberta. Salve para voltar a ela.`, 5000);
        } }, el('span', { texto: `Versão ${v.versao}` }), el('small', { texto: `${quando(v.criado_em)}${v.por ? ' · ' + v.por : ''}` })))) : el('p', { texto: 'Nenhuma versão anterior ainda.' }),
        el('div', { class: 'rodape' }, el('button', { class: 'btn', type: 'button', texto: 'Fechar', onclick: () => d.close() })));
      d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal();
    } catch (e) { aviso(e.message); }
  };
  window.addEventListener('beforeunload', e => { if (mudou && podeEditar) { e.preventDefault(); e.returnValue = ''; } });

  // ------------------------------------------------------------------ início
  (async () => {
    try {
      const [proj, quem] = await Promise.all([api('GET', `/api/projetos/${ID}`), api('GET', '/api/eu')]);
      eu = quem; P = proj.planta; versao = proj.plantaVersao; papel = proj.papel; nome = proj.nome;
      podeEditar = papel !== 'leitor';
      PL.inferirFolhas(P); PL.derivar(P);
      $('titulo').textContent = 'Planta · ' + nome; document.title = `Planta · ${nome}`;
      if (!podeEditar) { for (const b of document.querySelectorAll('#ferramentas [data-f]')) if (b.dataset.f !== 'selecionar') b.hidden = true; $('bVersoes').hidden = true; $('bSalvar').hidden = true; $('bDesfazer').hidden = true; $('bRefazer').hidden = true; }
      usarFerramenta('selecionar'); atualizarEstado(); montarPaineis(); enquadrar(); carregarFundo();
    } catch (e) { aviso(e.message, 8000); }
  })();
}());
