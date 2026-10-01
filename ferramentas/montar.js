// Gera dist/index.html, uma página completa que abre direto no navegador,
// a partir de src/casa-975-3d.html (que está no formato do artefato, sem <html>/<head>/<body>).
//
//   node ferramentas/montar.js            -> usa o three.js do CDN (precisa de internet)
//   node ferramentas/montar.js --offline  -> copia o three.js de node_modules para dist/vendor
//
// O esqueleto abaixo é o mesmo que o artefato do claude.ai coloca em volta da página.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const offline = process.argv.includes('--offline');
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.147.0/';

let pagina = fs.readFileSync(path.join(raiz, 'src', 'casa-975-3d.html'), 'utf8');

if (offline) {
  const usados = new Set([...pagina.matchAll(/https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/([^"']+)/g)].map(m => m[1]));
  for (const arq of usados) {
    const de = path.join(raiz, 'node_modules', 'three', arq);
    const para = path.join(raiz, 'dist', 'vendor', 'three', arq);
    if (!fs.existsSync(de)) { console.error(`Faltou ${de}. Rode "npm install" antes.`); process.exit(1); }
    fs.mkdirSync(path.dirname(para), { recursive: true });
    fs.copyFileSync(de, para);
  }
  pagina = pagina.split(CDN).join('vendor/three/');
}

const ESQUELETO = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
  + 'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}'
  + 'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n';

fs.mkdirSync(path.join(raiz, 'dist'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'dist', 'index.html'), ESQUELETO + pagina + '\n</body></html>\n');
console.log(`dist/index.html gerado${offline ? ' (three.js local em dist/vendor)' : ''}.`);
