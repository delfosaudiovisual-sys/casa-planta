// Abre a página num Chromium sem tela, roda uma "cena" e salva fotos em ferramentas/fotos/.
//
//   node ferramentas/foto.js [cena.js] [largura] [altura]
//   ex.: node ferramentas/foto.js ferramentas/cenas/basico.js 1400 860
//        node ferramentas/foto.js ferramentas/cenas/basico.js 390 844   (celular)
//
// Variáveis opcionais:
//   PAGINA=src/outra.html   página a testar (padrão: src/casa-975-3d.html)
//   ITENS=dados/itens.json  móveis carregados no localStorage antes de abrir (modo "só neste navegador")
//   PLANTA=testes/plantas/teste-10x30.json  outra planta no lugar da Casa 975 (vira window.__PLANTA)
//   CHROMIUM_PATH=...       executável do Chromium, se o do Playwright não estiver instalado
//
// Uma cena é um módulo: module.exports = async (page, foto) => { ... await foto('nome'); }
// Dentro da página, window.__casa expõe funções internas para a cena (veja a lista em EXPOE).
// O WebGL roda em software (SwiftShader): cada quadro é lento, então animações e o "andar"
// devem ser testados chamando as funções direto (stepDoors, stepFurn, walkStep...), não esperando o tempo passar.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const [, , cenaArq = path.join(raiz, 'ferramentas', 'cenas', 'basico.js'), W = '1400', H = '860'] = process.argv;
const PAGINA = path.resolve(raiz, process.env.PAGINA || 'src/casa-975-3d.html');
const ITENS = path.resolve(raiz, process.env.ITENS || 'dados/itens.json');
const THREE_DIR = path.join(raiz, 'node_modules', 'three');
const FOTOS = path.join(raiz, 'ferramentas', 'fotos');

// mesmo esqueleto que o artefato coloca em volta da página
const ESQUELETO = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box}body{margin:0;padding:0;font:14px sans-serif;background:#faf9f5;color:#141413}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n';

// funções internas que ficam acessíveis em window.__casa (injetadas logo antes do laço de desenho)
const EXPOE = 'window.__casa = {hitDoor, occluders, ray, doorParts, toggleDoor, stepDoors, setDoor, walkStep, collide, setView, persp, ctrlP, ortho, ctrlO, walk, get items(){return items}, select, invalidate, fpCam, updateFP, focusRoom, renderer, scene, get mode(){return mode}, selectOpening, editOpening, hitOpening, openingOf, setOpenPick, store, get config(){return config}, OPENINGS, DOORS, WALLS, setMeasure, doUndo, doRedo, act, get selectedId(){return selectedId}, get multi(){return [...multi]}, rotSel, mergeLPlan, toggleGroup, partsOf, hitsWall, overlapsOf, furnLeaves, toggleFurn, stepFurn};';

(async () => {
  let src = fs.readFileSync(PAGINA, 'utf8');
  if (!src.includes('const clock = new THREE.Clock();')) { console.error('Não achei o ponto de injeção (const clock = new THREE.Clock();).'); process.exit(1); }
  src = src.replace('const clock = new THREE.Clock();', EXPOE + ' const clock = new THREE.Clock();');
  const html = ESQUELETO + src + '\n</body></html>';

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: +W < 800, isMobile: +W < 800 });
  const page = await ctx.newPage();
  const erros = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) erros.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));

  // a página roda em http://casa.test/; o three.js vem de node_modules; o resto da rede é bloqueado (fontes etc.)
  await page.route('**/*', route => {
    const u = route.request().url();
    const m = u.match(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)$/);
    if (m) return route.fulfill({ path: path.join(THREE_DIR, m[1]), contentType: 'application/javascript' });
    if (u.startsWith('http://casa.test/')) return route.fulfill({ body: html, contentType: 'text/html' });
    return route.abort();
  });

  if (process.env.PLANTA) {
    const planta = JSON.parse(fs.readFileSync(path.resolve(raiz, process.env.PLANTA), 'utf8'));
    await page.addInitScript(p => { window.__PLANTA = p; }, planta);
  }
  const itens = fs.existsSync(ITENS) ? fs.readFileSync(ITENS, 'utf8') : '[]';
  await page.addInitScript(its => { try { if (!localStorage.getItem('casa975-itens')) localStorage.setItem('casa975-itens', its); } catch {} }, itens);
  await page.goto('http://casa.test/');
  try { await page.waitForFunction(() => window.__casa, null, { timeout: 60000 }); }
  catch (e) { console.log(erros.join('\n') || 'A página não terminou de carregar.'); await browser.close(); process.exit(1); }
  await page.waitForTimeout(1500);

  fs.mkdirSync(FOTOS, { recursive: true });
  const foto = async nome => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(FOTOS, nome + '.png'), timeout: 180000 }); console.log('foto: ferramentas/fotos/' + nome + '.png'); };
  const cena = require(path.resolve(cenaArq));
  try { await cena(page, foto); } catch (e) { erros.push('cena: ' + e.stack); }

  // "Failed to load resource" é esperado: as fontes do Google ficam bloqueadas no teste
  const reais = erros.filter(e => !/Failed to load resource/.test(e));
  console.log(reais.length ? reais.join('\n') : 'sem erros');
  await browser.close();
  process.exit(reais.length ? 1 : 0);
})();
