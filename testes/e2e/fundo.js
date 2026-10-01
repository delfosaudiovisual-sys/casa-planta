// Teste no navegador da planta de fundo do editor: PDF na escala 1:100, DXF em centímetros e imagem com calibração.
// O PDF é gerado aqui mesmo (uma planta desenhada em HTML, impressa em A4 na escala 1:100).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const raiz = path.join(__dirname, '..', '..');
const FOTOS = path.join(__dirname, 'fotos');
const PORTA = 3800 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORTA}`;
const ADMIN = { email: 'admin@exemplo.com', senha: 'senha-de-teste-123' };

// planta 8 × 10 m desenhada em milímetros de papel: 1:100 → 1 m = 10 mm
const PLANTA_HTML = `<!doctype html><html><head><style>@page{size:A4;margin:0}body{margin:0}
.c{position:absolute;border:1.5mm solid #000;box-sizing:border-box;font:3mm sans-serif;display:flex;align-items:center;justify-content:center}</style></head><body>
<div class="c" style="left:20mm;top:20mm;width:80mm;height:100mm"></div>
<div class="c" style="left:20mm;top:20mm;width:41.5mm;height:60mm">SALA 4,00 x 5,85</div>
<div class="c" style="left:60mm;top:20mm;width:40mm;height:60mm">QUARTO</div>
<div class="c" style="left:20mm;top:78.5mm;width:80mm;height:41.5mm">COZINHA</div>
</body></html>`;

async function esperarServidor() {
  for (let i = 0; i < 100; i++) { try { const r = await fetch(BASE + '/saude'); if (r.ok) return; } catch { /* ainda não */ } await new Promise(r => setTimeout(r, 150)); }
  throw new Error('o servidor não subiu');
}

(async () => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'casa-e2e-'));
  const srv = spawn(process.execPath, [path.join(raiz, 'servidor', 'index.js')], {
    env: { ...process.env, NODE_ENV: 'test', LOG_NIVEL: 'warn', PORT: String(PORTA), HOST: '127.0.0.1', DATA_DIR: dados, ADMIN_EMAIL: ADMIN.email, ADMIN_SENHA_INICIAL: ADMIN.senha, ANTHROPIC_API_KEY: '' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const erros = [];
  let browser;
  try {
    await esperarServidor();
    fs.mkdirSync(FOTOS, { recursive: true });
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    // gera o PDF
    const tmp = await browser.newPage(); await tmp.setContent(PLANTA_HTML);
    const pdf = path.join(dados, 'planta.pdf'); await tmp.pdf({ path: pdf, format: 'A4', printBackground: true }); await tmp.close();

    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
    page.on('pageerror', e => erros.push(e.message));
    const respostas = [];          // respostas aos prompt() do editor, em ordem
    page.on('dialog', d => d.accept(respostas.length ? respostas.shift() : undefined));
    await page.goto(BASE + '/entrar');
    await page.fill('#email', ADMIN.email); await page.fill('#senha', ADMIN.senha); await page.click('#ir');
    await page.waitForURL(/\/projetos/);
    const api = (m, u, c) => page.evaluate(([m, u, c]) => window.Casa.api(m, u, c), [m, u, c]);
    const { id } = await api('POST', '/api/projetos', { nome: 'Fundo', modelo: 'em-branco', largura: 12, profundidade: 25 });
    await page.goto(`${BASE}/projeto/${id}/editor`);
    await page.waitForSelector('#svg');
    const planta = () => page.evaluate(i => window.Casa.api('GET', `/api/projetos/${i}`).then(p => p.planta), id);
    const enviar = async arq => { await page.click('[data-aba="fundo"]'); await page.setInputFiles('[data-painel="fundo"] input[type=file]', arq); };

    // PDF na escala 1:100: a imagem deve medir 21 m de largura (A4 = 210 mm)
    respostas.push('100');
    await enviar(pdf);
    await page.waitForSelector('#svg image', { timeout: 60000, state: 'attached' }).catch(async e => {
      console.log('aviso na tela:', await page.evaluate(() => document.querySelector('.toast') && document.querySelector('.toast').textContent)); throw e;
    });
    const larguraPdf = await page.evaluate(() => { const im = document.querySelector('#svg image'); return Number(im.getAttribute('width')); });
    assert.ok(Math.abs(larguraPdf - 21) < 0.05, `largura do PDF em metros: ${larguraPdf}`);
    await page.click('#bEnquadrar');
    await page.waitForTimeout(500); await page.screenshot({ path: path.join(FOTOS, 'f1-pdf.png') }); console.log('foto: f1-pdf');

    // calibração: dois pontos a 200 px um do outro na tela, distância real informada de 500 cm
    await page.click('text=Calibrar a escala');
    const box = await page.locator('#svg').boundingBox();
    const ini = (await page.evaluate(() => document.querySelector('#svg image').getAttribute('width')));
    respostas.push('500');
    await page.mouse.click(box.x + 300, box.y + 300); await page.mouse.click(box.x + 500, box.y + 300);
    await page.waitForFunction(w => document.querySelector('#svg image').getAttribute('width') !== w, ini, { timeout: 5000 });
    const sPx = await page.evaluate(() => { const g = document.querySelector('#svg g[transform]'); return Number(/scale\(([\d.]+)/.exec(g.getAttribute('transform'))[1]); });
    const novaLarg = Number(await page.evaluate(() => document.querySelector('#svg image').getAttribute('width')));
    // 200 px na tela = 5 m de verdade → a imagem cresce na mesma proporção
    assert.ok(Math.abs(novaLarg / Number(ini) - 5 / (200 / sPx)) < 0.02, 'calibração mudou a escala na proporção certa');

    // DXF em centímetros ($INSUNITS = 5): 8 m de largura
    await enviar(path.join(raiz, 'testes', 'arquivos', 'casa-simples.dxf'));
    await page.waitForSelector('#svg path.linha-dxf', { timeout: 30000 });
    await page.click('#bSalvar');
    await page.waitForFunction(() => document.getElementById('estado').textContent === 'salvo', null, { timeout: 15000 });
    const p = await planta();
    assert.equal(p.referencia.tipo, 'dxf'); assert.equal(p.referencia.escala, 0.01);
    await page.click('#bEnquadrar');
    await page.waitForTimeout(300); await page.screenshot({ path: path.join(FOTOS, 'f2-dxf.png') }); console.log('foto: f2-dxf');

    const reais = erros.filter(e => !/favicon/.test(e));
    if (reais.length) { console.log('Erros no navegador:\n' + reais.join('\n')); process.exitCode = 1; }
    else console.log('e2e fundo: tudo certo');
  } catch (e) {
    console.error(e); if (erros.length) console.log('Erros no navegador:\n' + erros.join('\n'));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    srv.kill('SIGTERM');
    fs.rmSync(dados, { recursive: true, force: true });
  }
})();
