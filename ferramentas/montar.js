// Monta o que o servidor entrega, em dist/:
//   dist/publico/   arquivos estáticos (css, js, three.js, fontes, leitores de PDF e DXF, scripts da página 3D)
//   dist/paginas/   modelos das páginas HTML (o servidor troca __V__ pela versão e __ID__ pelo projeto)
//   dist/montagem.txt  marca desta montagem (muda a cada alteração: o navegador busca os arquivos novos)
// A página 3D vem de src/casa-975-3d.html (formato do artefato): os <script> viram arquivos separados, as fontes do
// Google e o three.js do CDN passam a ser locais, e entram o link "voltar" e o cartão "Planta da casa".
//
//   node ferramentas/montar.js            -> dist/
//   node ferramentas/montar.js --avulso   -> dist-avulso/index.html, página única como no artefato (precisa de internet)
//   node ferramentas/montar.js --avulso --offline -> idem, com o three.js copiado (sem internet)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const raiz = path.join(__dirname, '..');
const nm = (...p) => path.join(raiz, 'node_modules', ...p);
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.147.0/';
const fonte = fs.readFileSync(path.join(raiz, 'src', 'casa-975-3d.html'), 'utf8');

function copiar(de, para) { fs.mkdirSync(path.dirname(para), { recursive: true }); fs.copyFileSync(de, para); }
function copiarPasta(de, para) {
  for (const n of fs.readdirSync(de, { withFileTypes: true })) {
    const a = path.join(de, n.name), b = path.join(para, n.name);
    if (n.isDirectory()) copiarPasta(a, b); else copiar(a, b);
  }
}
function exigir(arq) { if (!fs.existsSync(arq)) { console.error(`Faltou ${path.relative(raiz, arq)}. Rode "npm install" antes.`); process.exit(1); } return arq; }
const threeUsados = () => [...new Set([...fonte.matchAll(/https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/([^"']+)/g)].map(m => m[1]))];

// ------------------------------------------------------------------ página única (como no artefato)
if (process.argv.includes('--avulso')) {
  const offline = process.argv.includes('--offline'), saida = path.join(raiz, 'dist-avulso');
  let pagina = fonte;
  if (offline) {
    for (const arq of threeUsados()) copiar(exigir(nm('three', arq)), path.join(saida, 'vendor', 'three', arq));
    pagina = pagina.split(CDN).join('vendor/three/');
  }
  const ESQUELETO = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
    + 'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}'
    + 'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n';
  fs.mkdirSync(saida, { recursive: true });
  fs.writeFileSync(path.join(saida, 'index.html'), ESQUELETO + pagina + '\n</body></html>\n');
  console.log(`dist-avulso/index.html gerado${offline ? ' (three.js local em dist-avulso/vendor)' : ''}.`);
  process.exit(0);
}

// ------------------------------------------------------------------ servidor
const dist = path.join(raiz, 'dist'), publico = path.join(dist, 'publico'), paginas = path.join(dist, 'paginas');
fs.rmSync(dist, { recursive: true, force: true });
copiarPasta(path.join(raiz, 'web', 'publico'), publico);
copiarPasta(path.join(raiz, 'web', 'paginas'), paginas);
copiar(path.join(raiz, 'compartilhado', 'planta.js'), path.join(publico, 'js', 'planta.js'));

// bibliotecas
for (const arq of threeUsados()) copiar(exigir(nm('three', arq)), path.join(publico, 'vendor', 'three', arq));
for (const arq of ['pdf.min.mjs', 'pdf.worker.min.mjs']) copiar(exigir(nm('pdfjs-dist', 'build', arq)), path.join(publico, 'vendor', 'pdfjs', arq));
copiar(exigir(nm('dxf-parser', 'dist', 'dxf-parser.js')), path.join(publico, 'vendor', 'dxf-parser.js'));
let css = '';
for (const [familia, pacote, pesos] of [['IBM Plex Sans', 'ibm-plex-sans', [400, 500, 600, 700]], ['IBM Plex Mono', 'ibm-plex-mono', [400, 500]]]) {
  for (const p of pesos) for (const [sub, faixa] of [['latin', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
    ['latin-ext', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF']]) {
    const nome = `${pacote}-${sub}-${p}-normal.woff2`;
    copiar(exigir(nm('@fontsource', pacote, 'files', nome)), path.join(publico, 'vendor', 'fontes', nome));
    css += `@font-face{font-family:"${familia}";font-style:normal;font-weight:${p};font-display:swap;src:url(${nome}) format("woff2");unicode-range:${faixa}}\n`;
  }
}
fs.writeFileSync(path.join(publico, 'vendor', 'fontes', 'fontes.css'), css);

// ------------------------------------------------------------------ página 3D
const scripts = [...fonte.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 2) { console.error(`Esperava 2 <script> em src/casa-975-3d.html e achei ${scripts.length}. Atualize ferramentas/montar.js.`); process.exit(1); }
fs.mkdirSync(path.join(publico, 'casa'), { recursive: true });
fs.writeFileSync(path.join(publico, 'casa', 'texturas.js'), scripts[0][1]);
fs.writeFileSync(path.join(publico, 'casa', 'app.js'), scripts[1][1]);

let corpo = fonte;
corpo = corpo.replace(/<meta charset="utf-8">\s*/, '').replace(/<title>[\s\S]*?<\/title>\s*/, '');
corpo = corpo.replace(/<link rel="(preconnect|stylesheet)" href="https:\/\/fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g, '');
corpo = corpo.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/([^"]+)"><\/script>/g, (m, arq) => `<script src="/vendor/three/${arq}?v=__V__"></script>`);
corpo = corpo.replace(scripts[0][0], '<script src="/casa/texturas.js?v=__V__"></script>').replace(scripts[1][0], '<script src="/casa/app.js?v=__V__"></script>');
const trocar = (de, para) => { if (!corpo.includes(de)) { console.error('Não achei na página: ' + de); process.exit(1); } corpo = corpo.replace(de, para); };
// link de volta para a lista de projetos e cartão da planta (só no programa; o artefato continua sem eles)
trocar('<header>\n    <h1>', '<header>\n    <a class="nv-voltar" href="/projetos" title="Voltar para os projetos" aria-label="Voltar para os projetos">←</a>\n    <h1>');
trocar('<div class="pane" id="paneSet" hidden>\n', '<div class="pane" id="paneSet" hidden>\n      <section class="card" id="nvPlanta">\n        <h2>Planta da casa</h2>\n'
  + '        <p class="note">Paredes, portas, janelas e cômodos deste projeto. Mudou a planta? Esta página avisa para recarregar.</p>\n'
  + '        <div class="row"><a class="btn" id="nvEditar" href="editor">Editar planta</a><a class="btn" href="/projetos">Projetos e compartilhar</a></div>\n      </section>\n');
const ESTILO = '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
  + 'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}'
  + '.nv-voltar{font:600 18px var(--sans);color:var(--ink);text-decoration:none;border:1px solid var(--line);border-radius:7px;padding:2px 9px}.nv-voltar:hover{border-color:var(--accent)}'
  + '#nvPlanta a.btn{text-decoration:none;display:inline-flex;align-items:center}</style>';
const casa = '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  + '<title>Casa em 3D</title>\n<link rel="icon" href="/favicon.svg?v=__V__">\n<link rel="stylesheet" href="/vendor/fontes/fontes.css?v=__V__">\n' + ESTILO + '\n'
  + '<script src="/projeto/__ID__/inicio.js"></script>\n<script src="/js/ponte.js?v=__V__"></script>\n</head>\n<body>\n' + corpo.trim() + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(paginas, 'casa.html'), casa);

// ------------------------------------------------------------------ marca da montagem
const h = crypto.createHash('sha256');
(function somar(d) { for (const n of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = path.join(d, n.name); if (n.isDirectory()) somar(p); else h.update(n.name).update(fs.readFileSync(p)); } }(dist));
const marca = require('../package.json').version + '-' + h.digest('hex').slice(0, 10);
fs.writeFileSync(path.join(dist, 'montagem.txt'), marca + '\n');
console.log(`dist/ montado (${marca}).`);
