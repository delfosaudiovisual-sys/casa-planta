// Planta da casa: validação e geração automática (paredes pelos cômodos, folhas das portas, pisos, forros, muros).
// O mesmo arquivo roda no servidor (require) e no navegador (window.Planta), sem dependências.
//
// Formato (o mesmo que a página 3D lê em window.__PLANTA). Medidas em metros.
// Plano: x = esquerda→direita olhando da rua (0..largura do lote), y = rua→fundo (0..profundidade).
//   paredes   [x0,y0,x1,y1, aberturas]   retângulo da parede; abertura [a,b,base,topo,tipo,meta?]
//             a e b ficam ao longo do eixo maior da parede (x se for horizontal, y se for vertical)
//             tipo: 'win' janela | 'basc' basculante | 'door' porta de madeira | 'glass' porta de vidro de correr
//             meta (só portas): {dob:'a'|'b'|null, lado:1|-1}  dobradiça na ponta a ou b (null = vão sem folha);
//             lado = para onde abre (+y/+x ou -y/-x)
//   portas    [hx,hy,largura,anguloAberta,anguloFechada]  folhas de madeira (geradas a partir de meta)
//   comodos   {id,nome,r:[x0,y0,x1,y1],dims?,interno?,parede?:'azulejo',piso?:'cimento'|'brita',coberto?,rotulo?,atalho?}
//   auto      true: pisos externos, forros, luminárias e muros saem dos cômodos e de `terreno`
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Planta = fabrica();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TIPOS_ABERTURA = ['win', 'basc', 'door', 'glass'];
  const NOMES_ABERTURA = { win: 'Janela', basc: 'Basculante', door: 'Porta', glass: 'Porta de vidro' };
  const LIM = { paredes: 500, aberturas: 30, portas: 300, comodos: 200, retangulos: 300, luminarias: 300, muros: 100, pilares: 50, boxes: 20 };

  const arred = v => Math.round(v * 10000) / 10000;          // 0,1 mm
  const ehNum = v => typeof v === 'number' && Number.isFinite(v);
  const texto = (v, max, padrao = '') => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : padrao);

  function eixoX(w) { return (w[2] - w[0]) >= (w[3] - w[1]); }

  // ------------------------------------------------------------------ validação
  // Devolve {planta, erros}. A planta devolvida só tem campos conhecidos, com números arredondados.
  function validarPlanta(entrada) {
    const erros = [];
    const err = m => { if (erros.length < 30) erros.push(m); };
    const p = entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {};
    const out = {};
    const num = (v, nome, min, max) => {
      if (!ehNum(v)) { err(`${nome}: número inválido`); return null; }
      if (v < min || v > max) { err(`${nome}: fora do intervalo (${min} a ${max})`); return null; }
      return arred(v);
    };
    const lista = (v, nome, max) => {
      if (v == null) return [];
      if (!Array.isArray(v)) { err(`${nome}: deveria ser uma lista`); return []; }
      if (v.length > max) { err(`${nome}: no máximo ${max}`); return v.slice(0, max); }
      return v;
    };

    out.versao = 1;
    out.nome = texto(p.nome, 80, 'Casa') || 'Casa';
    const lote = p.lote && typeof p.lote === 'object' ? p.lote : {};
    const LW = num(lote.largura, 'largura do lote', 2, 200) ?? 10;
    const LD = num(lote.profundidade, 'profundidade do lote', 2, 300) ?? 25;
    out.lote = { largura: LW, profundidade: LD };
    out.peDireito = num(p.peDireito ?? 2.7, 'pé-direito', 2, 6) ?? 2.7;
    out.alturaPorta = num(p.alturaPorta ?? 2.1, 'altura das portas', 1.5, 4) ?? 2.1;
    out.alturaMuro = num(p.alturaMuro ?? 2.0, 'altura do muro', 0, 5) ?? 2.0;

    const X0 = -10, X1 = LW + 10, Y0 = -10, Y1 = LD + 10;
    const rect = (r, nome) => {
      if (!Array.isArray(r) || r.length < 4) { err(`${nome}: retângulo inválido`); return null; }
      const a = num(r[0], nome + ' x0', X0, X1), b = num(r[1], nome + ' y0', Y0, Y1), c = num(r[2], nome + ' x1', X0, X1), d = num(r[3], nome + ' y1', Y0, Y1);
      if (a == null || b == null || c == null || d == null) return null;
      if (c - a < 0.005 || d - b < 0.005) { err(`${nome}: largura ou comprimento zero`); return null; }
      return [a, b, c, d];
    };
    const ponto = (q, nome) => {
      if (!Array.isArray(q) || q.length < 2) { err(`${nome}: ponto inválido`); return null; }
      const x = num(q[0], nome + ' x', X0, X1), y = num(q[1], nome + ' y', Y0, Y1);
      return x == null || y == null ? null : [x, y];
    };

    out.paredes = [];
    lista(p.paredes, 'paredes', LIM.paredes).forEach((w, i) => {
      const r = rect(w, `parede ${i + 1}`); if (!r) return;
      const ax = (r[2] - r[0]) >= (r[3] - r[1]), s0 = ax ? r[0] : r[1], s1 = ax ? r[2] : r[3];
      const ops = [];
      lista(w[4], `aberturas da parede ${i + 1}`, LIM.aberturas).forEach((o, j) => {
        const nome = `abertura ${j + 1} da parede ${i + 1}`;
        if (!Array.isArray(o)) { err(nome + ': inválida'); return; }
        const tipo = TIPOS_ABERTURA.includes(o[4]) ? o[4] : null;
        if (!tipo) { err(nome + ': tipo inválido'); return; }
        const a = num(o[0], nome + ' início', s0 - 0.001, s1 + 0.001), b = num(o[1], nome + ' fim', s0 - 0.001, s1 + 0.001);
        const base = num(o[2], nome + ' peitoril', 0, out.peDireito), top = num(o[3], nome + ' altura', 0.1, out.peDireito + 0.01);
        if (a == null || b == null || base == null || top == null) return;
        if (b - a < 0.1) { err(nome + ': largura menor que 10 cm'); return; }
        if (top - base < 0.1) { err(nome + ': altura menor que 10 cm'); return; }
        const op = [a, b, base, top, tipo];
        if (tipo === 'door' && o[5] && typeof o[5] === 'object') {
          op.push({ dob: o[5].dob === 'a' || o[5].dob === 'b' ? o[5].dob : null, lado: o[5].lado === -1 ? -1 : 1 });
        }
        ops.push(op);
      });
      ops.sort((m, n) => m[0] - n[0]);
      for (let k = 1; k < ops.length; k++) if (ops[k][0] < ops[k - 1][1] - 0.001) err(`parede ${i + 1}: aberturas se sobrepõem`);
      out.paredes.push([...r, ops]);
    });

    out.portas = [];
    lista(p.portas, 'portas', LIM.portas).forEach((d, i) => {
      const nome = `folha de porta ${i + 1}`;
      if (!Array.isArray(d)) { err(nome + ': inválida'); return; }
      const v = [num(d[0], nome, X0, X1), num(d[1], nome, Y0, Y1), num(d[2], nome + ' largura', 0.2, 4), num(d[3], nome + ' ângulo', -360, 360), num(d[4], nome + ' ângulo', -360, 360)];
      if (v.every(x => x != null)) out.portas.push(v);
    });

    const ids = new Set();
    out.comodos = [];
    lista(p.comodos, 'cômodos', LIM.comodos).forEach((c, i) => {
      if (!c || typeof c !== 'object') { err(`cômodo ${i + 1}: inválido`); return; }
      const r = rect(c.r, `cômodo ${i + 1}`); if (!r) return;
      let id = typeof c.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(c.id) ? c.id : 'c' + (i + 1);
      while (ids.has(id)) id += '_';
      ids.add(id);
      const o = { id, nome: texto(c.nome, 60, 'Cômodo') || 'Cômodo', r };
      const dims = texto(c.dims, 60); if (dims) o.dims = dims;
      if (c.interno) o.interno = true;
      if (c.parede === 'azulejo') o.parede = 'azulejo';
      if (c.piso === 'cimento') o.piso = 'cimento';
      if (c.coberto) o.coberto = true;
      if (c.rotulo === false) o.rotulo = false;
      else if (Array.isArray(c.rotulo)) { const q = ponto(c.rotulo, `nome do cômodo ${i + 1}`); if (q) o.rotulo = q; }
      if (c.atalho === false) o.atalho = false;
      out.comodos.push(o);
    });

    const rects = (v, nome, max) => lista(v, nome, max).map((r, i) => rect(r, `${nome} ${i + 1}`)).filter(Boolean);
    out.azulejos = rects(p.azulejos, 'azulejos', LIM.retangulos);
    out.pisosExternos = rects(p.pisosExternos, 'piso externo', LIM.retangulos);
    out.forros = rects(p.forros, 'forro', LIM.retangulos);
    out.luminarias = lista(p.luminarias, 'luminárias', LIM.luminarias).map((q, i) => ponto(q, `luminária ${i + 1}`)).filter(Boolean);
    out.muros = rects(p.muros, 'muro', LIM.muros);
    out.pilares = [];
    lista(p.pilares, 'pilares', LIM.pilares).forEach((q, i) => {
      const r = rect(q, `pilar ${i + 1}`); if (!r) return;
      const h = q[4] == null ? null : num(q[4], `altura do pilar ${i + 1}`, 0.1, 10);
      out.pilares.push(h == null ? r : [...r, h]);
    });
    const faixa = (v, nome, min, max) => {
      if (v == null) return null;
      if (!Array.isArray(v) || v.length < 2) { err(nome + ': inválido'); return null; }
      const a = num(v[0], nome, min, max), b = num(v[1], nome, min, max);
      if (a == null || b == null) return null;
      if (b - a < 0.2) { err(nome + ': largura menor que 20 cm'); return null; }
      return [a, b];
    };
    out.portao = faixa(p.portao, 'portão', -1, LW + 1);
    out.medidor = faixa(p.medidor, 'medidor', -1, LW + 1);

    out.telhado = null;
    if (p.telhado && typeof p.telhado === 'object') {
      const t = p.telhado, T = {
        x0: num(t.x0 ?? 0, 'telhado: início', X0, X1), x1: num(t.x1 ?? LW, 'telhado: fim', X0, X1),
        frente: num(t.frente, 'telhado: frente', Y0, Y1), fundo: num(t.fundo, 'telhado: fundo', Y0, Y1), cumeeira: num(t.cumeeira, 'telhado: cumeeira', Y0, Y1),
        beiral: num(t.beiral, 'telhado: altura do beiral', 1.5, 12), inclinacao: num(t.inclinacao, 'telhado: inclinação', 0.02, 1.5),
      };
      if (Object.values(T).every(v => v != null)) {
        if (!(T.frente < T.cumeeira && T.cumeeira < T.fundo)) err('telhado: a cumeeira tem de ficar entre a frente e o fundo');
        else if (T.x1 - T.x0 < 0.5) err('telhado: largura muito pequena');
        else out.telhado = T;
      }
    }

    out.boxes = [];
    lista(p.boxes, 'boxes', LIM.boxes).forEach((b, i) => {
      if (!b || typeof b !== 'object') return;
      const eixo = b.eixo === 'y' ? 'y' : 'x', lim = eixo === 'x' ? [X0, X1] : [Y0, Y1], limC = eixo === 'x' ? [Y0, Y1] : [X0, X1];
      const a = num(b.a, `box ${i + 1}`, ...lim), bb = num(b.b, `box ${i + 1}`, ...lim), c = num(b.c, `box ${i + 1}`, ...limC);
      if (a == null || bb == null || c == null) return;
      if (bb - a < 0.4) { err(`box ${i + 1}: menor que 40 cm`); return; }
      out.boxes.push({ eixo, a, b: bb, c });
    });

    out.vizinhanca = p.vizinhanca === 'geminadas' ? 'geminadas' : 'nenhuma';
    const E = p.entrada && typeof p.entrada === 'object' ? p.entrada : {};
    out.entrada = {
      x: num(E.x ?? LW / 2, 'entrada x', X0, X1) ?? LW / 2,
      y: num(E.y ?? Math.min(2.4, LD / 2), 'entrada y', Y0, Y1) ?? 2,
      rumo: num(E.rumo ?? 0, 'entrada: direção', -10, 10) ?? 0,
    };
    const L = p.lados && typeof p.lados === 'object' ? p.lados : {};
    out.lados = {};
    for (const k of ['esquerda', 'direita']) { const t = texto(L[k], 60); if (t) out.lados[k] = t; }

    if (p.auto) {
      out.auto = true;
      const T = p.terreno && typeof p.terreno === 'object' ? p.terreno : {};
      out.terreno = { muroLaterais: T.muroLaterais !== false, muroFundo: T.muroFundo !== false, muroFrente: !!T.muroFrente };
    }
    if (ehNum(p.espessura)) out.espessura = num(p.espessura, 'espessura das paredes', 0.05, 0.6) ?? 0.15;
    if (p.paredesPelosComodos) out.paredesPelosComodos = true;      // o editor refaz as paredes sempre que um cômodo muda

    if (p.referencia && typeof p.referencia === 'object') {
      const R = p.referencia;
      if (typeof R.id === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(R.id)) {
        const ref = {
          id: R.id, tipo: R.tipo === 'dxf' ? 'dxf' : 'imagem',
          x: num(R.x ?? 0, 'fundo x', -1000, 1000) ?? 0, y: num(R.y ?? 0, 'fundo y', -1000, 1000) ?? 0,
          escala: num(R.escala ?? 0.01, 'escala do fundo', 1e-6, 1000) ?? 0.01,
          opacidade: num(R.opacidade ?? 0.5, 'opacidade do fundo', 0, 1) ?? 0.5,
          rot: num(R.rot ?? 0, 'giro do fundo', -360, 360) ?? 0,
        };
        const nome = texto(R.nome, 120); if (nome) ref.nome = nome;
        out.referencia = ref;
      }
    }
    return { planta: out, erros };
  }

  // ------------------------------------------------------------------ portas: folha de madeira a partir da abertura
  function folhaDaAbertura(w, op) {
    const meta = op[5];
    if (op[4] !== 'door' || !meta || !meta.dob) return null;
    const [x0, y0, x1, y1] = w, [a, b] = op, L = arred(b - a);
    if (eixoX(w)) return [meta.dob === 'a' ? a : b, meta.lado > 0 ? y1 : y0, L, meta.lado > 0 ? 90 : -90, meta.dob === 'a' ? 0 : 180];
    return [meta.lado > 0 ? x1 : x0, meta.dob === 'a' ? a : b, L, meta.lado > 0 ? 0 : 180, meta.dob === 'a' ? 90 : -90];
  }
  // plantas feitas à mão (como a Casa 975) têm só a lista de folhas: descobre a dobradiça e o lado de cada porta
  function inferirFolhas(p) {
    const usadas = new Set();
    for (const w of p.paredes) for (const op of w[4]) {
      if (op[4] !== 'door' || op[5]) continue;
      const [x0, y0, x1, y1] = w, ax = eixoX(w), e = 0.02;
      const i = (p.portas || []).findIndex((d, k) => !usadas.has(k) && d[0] >= x0 - e && d[0] <= x1 + e && d[1] >= y0 - e && d[1] <= y1 + e
        && (Math.abs((ax ? d[0] : d[1]) - op[0]) < e || Math.abs((ax ? d[0] : d[1]) - op[1]) < e));
      if (i < 0) { op[5] = { dob: null, lado: 1 }; continue; }
      usadas.add(i);
      const d = p.portas[i], u = ax ? d[0] : d[1], c = ax ? d[1] : d[0], c1 = ax ? y1 : x1;
      op[5] = { dob: Math.abs(u - op[0]) < e ? 'a' : 'b', lado: Math.abs(c - c1) < e ? 1 : -1 };
    }
    return p;
  }
  function gerarFolhas(p) {
    p.portas = [];
    for (const w of p.paredes) for (const op of w[4]) { const f = folhaDaAbertura(w, op); if (f) p.portas.push(f); }
    return p;
  }

  // ------------------------------------------------------------------ paredes
  const sobrepoe = (r, s) => Math.min(r[2], s[2]) - Math.max(r[0], s[0]) > 1e-6 && Math.min(r[3], s[3]) - Math.max(r[1], s[1]) > 1e-6;
  // Encontros em L e em T: a parede que termina dentro de outra é cortada na face da outra (evita faces sobrepostas, que piscam no 3D).
  function limparJuntas(paredes) {
    const cortada = new Set();
    for (let i = 0; i < paredes.length; i++) for (let j = 0; j < paredes.length; j++) {
      if (i === j) continue;
      const A = paredes[i], B = paredes[j];
      if (!A || !B || eixoX(A) === eixoX(B) || !sobrepoe(A, B) || cortada.has(j + ':' + i)) continue;
      const ax = eixoX(A);
      // A só é cortada se B atravessa toda a espessura de A, numa das pontas de A
      const espA = ax ? [A[1], A[3]] : [A[0], A[2]], espB = ax ? [B[1], B[3]] : [B[0], B[2]];
      if (!(espB[0] <= espA[0] + 1e-6 && espB[1] >= espA[1] - 1e-6)) continue;
      const a0 = ax ? A[0] : A[1], a1 = ax ? A[2] : A[3], b0 = ax ? B[0] : B[1], b1 = ax ? B[2] : B[3], tA = espA[1] - espA[0];
      let n0 = a0, n1 = a1;
      if (b0 <= a0 + tA + 1e-6 && b1 < a1) n0 = b1;          // B cobre o começo de A (ou A passa um toco menor que a espessura)
      else if (b1 >= a1 - tA - 1e-6 && b0 > a0) n1 = b0;     // B cobre o fim de A
      else continue;
      if (n1 - n0 < 0.01) continue;
      if (ax) { A[0] = arred(n0); A[2] = arred(n1); } else { A[1] = arred(n0); A[3] = arred(n1); }
      A[4] = A[4].filter(op => op[0] >= n0 - 1e-6 && op[1] <= n1 + 1e-6);
      cortada.add(i + ':' + j);
    }
    return paredes;
  }
  // Paredes em volta dos cômodos internos (pelo lado de fora de cada um), juntando as que coincidem.
  // As aberturas que já existiam passam para a parede nova que estiver no mesmo lugar.
  function paredesDosComodos(comodos, esp, antigas = []) {
    const H = [], V = [];
    for (const c of comodos) {
      if (!c.interno) continue;
      const [a, b, x1, y1] = c.r;
      H.push([a - esp, b - esp, x1 + esp, b], [a - esp, y1, x1 + esp, y1 + esp]);
      V.push([a - esp, b, a, y1], [x1, b, x1 + esp, y1]);
    }
    const juntar = (lst, ax) => {
      const grupos = new Map();
      for (const r of lst) { const k = ax ? `${arred(r[1])}|${arred(r[3])}` : `${arred(r[0])}|${arred(r[2])}`; (grupos.get(k) || grupos.set(k, []).get(k)).push(r); }
      const out = [];
      for (const g of grupos.values()) {
        g.sort((p, q) => (ax ? p[0] - q[0] : p[1] - q[1]));
        let cur = g[0].slice();
        for (const r of g.slice(1)) {
          const s0 = ax ? r[0] : r[1], s1 = ax ? r[2] : r[3], c1 = ax ? cur[2] : cur[3];
          if (s0 <= c1 + 0.001) { if (ax) cur[2] = Math.max(cur[2], s1); else cur[3] = Math.max(cur[3], s1); }
          else { out.push(cur); cur = r.slice(); }
        }
        out.push(cur);
      }
      return out;
    };
    // paredes verticais entre cômodos vizinhos: se uma horizontal passa por cima, corta
    const paredes = [...juntar(H, true), ...juntar(V, false)].map(r => [...r.map(arred), []]);
    limparJuntas(paredes);
    for (const w of antigas) for (const op of w[4] || []) {
      const ax = eixoX(w), cc = ax ? (w[1] + w[3]) / 2 : (w[0] + w[2]) / 2, m = (op[0] + op[1]) / 2;
      const nova = paredes.find(n => eixoX(n) === ax && (ax ? n[1] <= cc && n[3] >= cc && n[0] <= op[0] + 1e-6 && n[2] >= op[1] - 1e-6
        : n[0] <= cc && n[2] >= cc && n[1] <= op[0] + 1e-6 && n[3] >= op[1] - 1e-6));
      if (nova && !nova[4].some(o => o[0] < op[1] && o[1] > op[0])) { nova[4].push(op.slice()); nova[4].sort((p, q) => p[0] - q[0]); }
      void m;
    }
    return paredes;
  }

  // ------------------------------------------------------------------ geração automática (plantas novas)
  function derivar(p) {
    gerarFolhas(p);
    if (!p.auto) return p;
    const LW = p.lote.largura, LD = p.lote.profundidade, T = p.terreno || {};
    const centro = r => [arred((r[0] + r[2]) / 2), arred((r[1] + r[3]) / 2)];
    p.pisosExternos = p.comodos.filter(c => !c.interno && (c.piso === 'cimento' || c.coberto)).map(c => c.r.slice());
    p.forros = p.comodos.filter(c => !c.interno && c.coberto).map(c => c.r.slice());
    p.luminarias = p.comodos.filter(c => c.interno || c.coberto).map(c => centro(c.r));
    const m = 0.12, M = [];
    if (T.muroLaterais) M.push([-m, 0, 0, LD], [LW, 0, LW + m, LD]);
    if (T.muroFundo) M.push([-m, LD - m, LW + m, LD]);
    if (T.muroFrente) {
      const g = p.portao;
      if (g) { if (g[0] > 0.05) M.push([0, 0, g[0], m]); if (g[1] < LW - 0.05) M.push([g[1], 0, LW, m]); }
      else M.push([0, 0, LW, m]);
    }
    p.muros = M.map(r => r.map(arred));
    return p;
  }

  function plantaEmBranco({ nome = 'Nova casa', largura = 10, profundidade = 25 } = {}) {
    return derivar({
      versao: 1, nome, lote: { largura, profundidade }, peDireito: 2.7, alturaPorta: 2.1, alturaMuro: 2.0, espessura: 0.15,
      paredes: [], portas: [], comodos: [], azulejos: [], pisosExternos: [], forros: [], luminarias: [], muros: [], pilares: [],
      portao: null, medidor: null, telhado: null, boxes: [], vizinhanca: 'nenhuma',
      entrada: { x: arred(largura / 2), y: Math.min(2, profundidade / 4), rumo: 0 }, lados: {},
      auto: true, terreno: { muroLaterais: true, muroFundo: true, muroFrente: false }, paredesPelosComodos: true,
    });
  }

  // ------------------------------------------------------------------ leitura da planta pelo Claude (formato simplificado → planta)
  // r: {lote?, espessura?, comodos:[{nome,x,y,largura,profundidade,interno,azulejo?}], aberturas:[{tipo,comodo,lado,distancia,largura,peitoril,altura}]}
  // Coordenadas do cômodo: canto da frente-esquerda, medidas internas. lado: frente | fundo | esquerda | direita
  function plantaDaLeitura(r, base) {
    const esp = ehNum(r.espessura) && r.espessura >= 0.05 && r.espessura <= 0.5 ? r.espessura : 0.15;
    const comodos = (r.comodos || []).filter(c => ehNum(c.x) && ehNum(c.y) && ehNum(c.largura) && ehNum(c.profundidade) && c.largura > 0.2 && c.profundidade > 0.2)
      .map((c, i) => {
        const o = { id: 'c' + (i + 1), nome: texto(c.nome, 60, 'Cômodo') || 'Cômodo', r: [c.x, c.y, c.x + c.largura, c.y + c.profundidade].map(arred) };
        if (c.interno) o.interno = true; else o.piso = 'cimento';
        if (c.interno && c.azulejo) o.parede = 'azulejo';
        o.dims = `${String(arred(c.largura).toFixed(2)).replace('.', ',')} × ${String(arred(c.profundidade).toFixed(2)).replace('.', ',')} m`;
        return o;
      });
    const xs = comodos.flatMap(c => [c.r[0], c.r[2]]), ys = comodos.flatMap(c => [c.r[1], c.r[3]]);
    const LW = ehNum(r.lote?.largura) && r.lote.largura > 2 ? r.lote.largura : (xs.length ? Math.max(...xs) + esp + 0.5 : base?.lote?.largura || 10);
    const LD = ehNum(r.lote?.profundidade) && r.lote.profundidade > 2 ? r.lote.profundidade : (ys.length ? Math.max(...ys) + esp + 3 : base?.lote?.profundidade || 25);
    const p = plantaEmBranco({ nome: base?.nome || 'Casa', largura: arred(LW), profundidade: arred(LD) });
    p.espessura = esp; p.comodos = comodos; p.paredesPelosComodos = true;
    p.paredes = paredesDosComodos(comodos, esp);
    const tipos = { porta: 'door', janela: 'win', porta_vidro: 'glass', basculante: 'basc' };
    for (const o of r.aberturas || []) {
      const c = comodos[o.comodo], tipo = tipos[o.tipo];
      if (!c || !tipo || !ehNum(o.largura) || o.largura < 0.2) continue;
      const [a, b, x1, y1] = c.r, d = ehNum(o.distancia) ? Math.max(0, o.distancia) : 0;
      const ax = o.lado === 'frente' || o.lado === 'fundo';
      const s = arred((ax ? a : b) + d), e = arred(s + o.largura);
      const cc = o.lado === 'frente' ? b - esp / 2 : o.lado === 'fundo' ? y1 + esp / 2 : o.lado === 'esquerda' ? a - esp / 2 : x1 + esp / 2;
      const w = p.paredes.find(n => eixoX(n) === ax && (ax ? n[1] <= cc && n[3] >= cc && n[0] <= s && n[2] >= e : n[0] <= cc && n[2] >= cc && n[1] <= s && n[3] >= e));
      if (!w || w[4].some(q => q[0] < e && q[1] > s)) continue;
      const porta = tipo === 'door' || tipo === 'glass';
      const base0 = porta ? 0 : (ehNum(o.peitoril) ? Math.max(0, o.peitoril) : (tipo === 'basc' ? 1.6 : 1.0));
      const top = porta ? (ehNum(o.altura) ? Math.min(o.altura, p.peDireito) : 2.1) : Math.min(p.peDireito, base0 + (ehNum(o.altura) ? o.altura : (tipo === 'basc' ? 0.5 : 1.1)));
      const op = [s, e, arred(base0), arred(top), tipo];
      if (tipo === 'door') op.push({ dob: 'a', lado: o.lado === 'frente' || o.lado === 'esquerda' ? 1 : -1 });
      w[4].push(op); w[4].sort((m, n) => m[0] - n[0]);
    }
    const ext = comodos.find(c => !c.interno && c.r[1] < 1);
    p.entrada = { x: arred(ext ? (ext.r[0] + ext.r[2]) / 2 : LW / 2), y: arred(Math.min(2, (ext ? ext.r[3] : LD / 4) / 2)), rumo: 0 };
    return derivar(p);
  }

  return { validarPlanta, derivar, gerarFolhas, inferirFolhas, folhaDaAbertura, limparJuntas, paredesDosComodos, plantaEmBranco, plantaDaLeitura, eixoX, TIPOS_ABERTURA, NOMES_ABERTURA };
}));
