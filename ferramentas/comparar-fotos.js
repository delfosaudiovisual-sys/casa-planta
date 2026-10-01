// Compara as fotos de duas pastas (mesmo nome de arquivo) e diz quanto cada uma mudou.
//   node ferramentas/comparar-fotos.js pasta-antes pasta-depois [limite%]
// Sai com erro se alguma foto mudou mais que o limite (padrão 0,5% dos pixels).
// Grava em pasta-depois/diff-*.png as diferenças em vermelho.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const [, , antes, depois, lim = '0.5'] = process.argv;
if (!antes || !depois) { console.error('uso: node ferramentas/comparar-fotos.js pasta-antes pasta-depois [limite%]'); process.exit(2); }
let falhou = false;
for (const nome of fs.readdirSync(antes).filter(n => n.endsWith('.png') && !n.startsWith('diff-')).sort()) {
  const b = path.join(depois, nome);
  if (!fs.existsSync(b)) { console.log(`${nome}: falta em ${depois}`); falhou = true; continue; }
  const A = PNG.sync.read(fs.readFileSync(path.join(antes, nome))), B = PNG.sync.read(fs.readFileSync(b));
  if (A.width !== B.width || A.height !== B.height) { console.log(`${nome}: tamanhos diferentes`); falhou = true; continue; }
  const D = new PNG({ width: A.width, height: A.height });
  let n = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
    const g = (A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3 * 0.35;
    if (d > 24) { n++; D.data[i] = 255; D.data[i + 1] = 0; D.data[i + 2] = 0; } else { D.data[i] = D.data[i + 1] = D.data[i + 2] = g; }
    D.data[i + 3] = 255;
  }
  const pct = 100 * n / (A.width * A.height);
  if (n) fs.writeFileSync(path.join(depois, 'diff-' + nome), PNG.sync.write(D));
  const ruim = pct > Number(lim);
  if (ruim) falhou = true;
  console.log(`${ruim ? 'MUDOU ' : 'ok    '} ${nome}: ${pct.toFixed(3)}% dos pixels`);
}
process.exit(falhou ? 1 : 0);
