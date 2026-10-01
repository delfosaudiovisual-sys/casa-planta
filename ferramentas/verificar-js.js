// Confere a sintaxe de todos os .js do servidor, das páginas e das ferramentas (node --check), sem rodar nada.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const arqs = [];
(function andar(d) {
  for (const n of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-avulso', '.git', 'dados-servidor'].includes(n.name)) continue;
    const p = path.join(d, n.name);
    if (n.isDirectory()) andar(p); else if (/\.(js|mjs)$/.test(n.name)) arqs.push(p);
  }
}(raiz));
let falhou = 0;
for (const a of arqs) {
  try { execFileSync(process.execPath, ['--check', a], { stdio: 'pipe' }); }
  catch (e) { falhou++; console.log(path.relative(raiz, a) + '\n' + String(e.stderr)); }
}
console.log(falhou ? `FALHOU em ${falhou} de ${arqs.length} arquivos` : `js ok (${arqs.length} arquivos)`);
process.exit(falhou ? 1 : 0);
