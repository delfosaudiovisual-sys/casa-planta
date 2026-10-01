// compartilhado/planta.js: validação, folhas das portas, paredes pelos cômodos, leitura do Claude.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Planta = require('../compartilhado/planta');

const CASA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'modelos', 'casa-975.json'), 'utf8'));
const sobrepoe = (r, s) => Math.min(r[2], s[2]) - Math.max(r[0], s[0]) > 1e-6 && Math.min(r[3], s[3]) - Math.max(r[1], s[1]) > 1e-6;
const ordenar = l => l.map(x => JSON.stringify(x)).sort();

test('modelos/casa-975.json é a mesma planta embutida na página 3D', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'src', 'casa-975-3d.html'), 'utf8');
  const i = s.indexOf('const PLANTA_975 = '), j = s.indexOf('\nfunction lerPlanta', i);
  const P = vm.runInNewContext('(' + s.slice(i + 19, j).trim().replace(/;$/, '') + ')');
  assert.deepEqual(JSON.parse(JSON.stringify(P)), CASA);
});

test('a Casa 975 passa na validação sem mudar nada', () => {
  const { planta, erros } = Planta.validarPlanta(CASA);
  assert.deepEqual(erros, []);
  assert.deepEqual(planta.paredes, CASA.paredes);
  assert.deepEqual(planta.portas, CASA.portas);
  assert.equal(planta.comodos.length, 10);
});

test('folhas das portas: descobrir a dobradiça e gerar de novo dá as mesmas portas', () => {
  const p = JSON.parse(JSON.stringify(CASA));
  Planta.inferirFolhas(p);
  Planta.gerarFolhas(p);
  assert.deepEqual(ordenar(p.portas), ordenar(CASA.portas));
});

test('validação recusa aberturas fora da parede, sobrepostas e números inválidos', () => {
  const p = JSON.parse(JSON.stringify(CASA));
  p.paredes[2][4].push([7.5, 8.0, 0, 2.1, 'door']);
  assert.ok(Planta.validarPlanta(p).erros.some(e => /sobrep/.test(e)));
  const q = JSON.parse(JSON.stringify(CASA)); q.paredes[1][4][0][1] = 50;
  assert.ok(Planta.validarPlanta(q).erros.length);
  const r = JSON.parse(JSON.stringify(CASA)); r.lote.largura = 'cinco';
  assert.ok(Planta.validarPlanta(r).erros.length);
  const s = JSON.parse(JSON.stringify(CASA)); s.paredes[0][4] = [[1, 2, 0, 2.1, '<script>']];
  assert.ok(Planta.validarPlanta(s).erros.some(e => /tipo/.test(e)));
  const t = JSON.parse(JSON.stringify(CASA)); t.comodos[0].nome = 'A'.repeat(500); t.extra = { qualquer: 1 };
  const v = Planta.validarPlanta(t);
  assert.equal(v.planta.comodos[0].nome.length, 60); assert.equal(v.planta.extra, undefined);
});

test('paredes pelos cômodos: vizinhos dividem a parede e nada se sobrepõe', () => {
  const comodos = [
    { id: 'a', nome: 'Sala', r: [1, 5, 4, 9], interno: true },
    { id: 'b', nome: 'Quarto', r: [4.15, 5, 7, 8], interno: true },
    { id: 'c', nome: 'Banheiro', r: [4.15, 8.15, 7, 9], interno: true },
    { id: 'q', nome: 'Quintal', r: [0, 12, 10, 20] },
  ];
  const ps = Planta.paredesDosComodos(comodos, 0.15);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(!sobrepoe(ps[i], ps[j]), `paredes ${i} e ${j} se sobrepõem`);
  // cada cômodo interno fica cercado: os quatro lados encostam numa parede
  for (const c of comodos.filter(c => c.interno)) {
    const [a, b, x1, y1] = c.r;
    const encosta = (px, py) => ps.some(w => px >= w[0] - 1e-6 && px <= w[2] + 1e-6 && py >= w[1] - 1e-6 && py <= w[3] + 1e-6);
    assert.ok(encosta((a + x1) / 2, b - 0.05) && encosta((a + x1) / 2, y1 + 0.05) && encosta(a - 0.05, (b + y1) / 2) && encosta(x1 + 0.05, (b + y1) / 2), c.nome);
  }
  const { erros } = Planta.validarPlanta({ lote: { largura: 10, profundidade: 25 }, paredes: ps, comodos });
  assert.deepEqual(erros, []);
});

test('juntas em L e em T ficam sem sobreposição', () => {
  const ps = [[0, 0, 5, 0.15, []], [0, 0, 0.15, 4, []], [2.5, -0.075, 2.65, 3, []]];
  Planta.limparJuntas(ps);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(!sobrepoe(ps[i], ps[j]));
});

test('planta em branco e leitura do Claude viram plantas válidas', () => {
  const b = Planta.plantaEmBranco({ largura: 8, profundidade: 20 });
  assert.deepEqual(Planta.validarPlanta(b).erros, []);
  assert.equal(b.muros.length, 3);
  const leitura = {
    lote: { largura: 10, profundidade: 25 }, espessura: 0.15, observacoes: '',
    comodos: [
      { nome: 'Sala', x: 1, y: 5, largura: 4, profundidade: 4, interno: true, azulejo: false },
      { nome: 'Cozinha', x: 5.15, y: 5, largura: 3, profundidade: 4, interno: true, azulejo: true },
      { nome: 'Garagem', x: 1, y: 0, largura: 4, profundidade: 4.85, interno: false, azulejo: false },
    ],
    aberturas: [
      { tipo: 'porta', comodo: 0, lado: 'frente', distancia: 1, largura: 0.8, peitoril: 0, altura: 2.1 },
      { tipo: 'janela', comodo: 1, lado: 'fundo', distancia: 0.5, largura: 1.2, peitoril: 1.0, altura: 1.1 },
      { tipo: 'porta', comodo: 0, lado: 'direita', distancia: 1, largura: 0.8, peitoril: 0, altura: 2.1 },
      { tipo: 'porta', comodo: 9, lado: 'frente', distancia: 0, largura: 0.8, peitoril: 0, altura: 2.1 },
    ],
  };
  const p = Planta.plantaDaLeitura(leitura, { nome: 'Teste' });
  const { erros, planta } = Planta.validarPlanta(p);
  assert.deepEqual(erros, []);
  assert.equal(planta.comodos.length, 3);
  const ops = planta.paredes.flatMap(w => w[4]);
  assert.equal(ops.length, 3, 'três aberturas válidas (a do cômodo 9 não existe)');
  assert.equal(planta.portas.length, 2);
  assert.equal(planta.comodos[1].parede, 'azulejo');
});
