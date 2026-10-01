// Teste de ponta a ponta num Chromium sem tela: sobe um servidor novo (banco vazio numa pasta temporária),
// entra como administrador, abre a Casa 975 em 3D, confere o tempo real entre duas abas, cria um projeto
// em branco, desenha cômodos e uma porta no editor, salva, abre em 3D e testa uma pessoa "só vê".
// Fotos em testes/e2e/fotos/. Qualquer erro no console (inclusive bloqueio da política de segurança) reprova.
//
//   npm run montar && npm run e2e
//   CHROMIUM_PATH=/caminho/do/chromium npm run e2e      (se o Chromium do Playwright não estiver instalado)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const raiz = path.join(__dirname, '..', '..');
const FOTOS = path.join(__dirname, 'fotos');
const PORTA = 3200 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORTA}`;
const ADMIN = { email: 'admin@exemplo.com', senha: 'senha-de-teste-123' };

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
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const vigiar = (page, nome) => {
      page.on('console', m => { if (m.type() === 'error') erros.push(`${nome}: ${m.text()}`); });
      page.on('pageerror', e => erros.push(`${nome}: ${e.message}`));
    };
    const foto = async (page, nome) => { await page.waitForTimeout(600); await page.screenshot({ path: path.join(FOTOS, nome + '.png'), timeout: 180000 }); console.log('foto: ' + nome); };

    // ------------------------------------------------------------------ entrar
    const page = await ctx.newPage(); vigiar(page, 'principal');
    await page.goto(BASE + '/');
    assert.match(page.url(), /\/entrar/);
    await page.fill('#email', ADMIN.email); await page.fill('#senha', 'senha-errada-000');
    await page.click('#ir'); await page.waitForSelector('#erro:not([hidden])');
    erros.length = 0;          // o 401 da senha errada aparece no console; é esperado
    await page.fill('#senha', ADMIN.senha); await page.click('#ir');
    await page.waitForURL(/\/projetos/);
    await page.waitForSelector('.projeto');
    await foto(page, '01-projetos');
    const api = (metodo, url, corpo) => page.evaluate(async ([m, u, c]) => {
      const r = await fetch(u, { method: m, headers: c ? { 'Content-Type': 'application/json' } : {}, body: c ? JSON.stringify(c) : undefined });
      const d = await r.json(); if (!r.ok) throw new Error(`${m} ${u}: ${r.status} ${d.erro}`); return d;
    }, [metodo, url, corpo]);
    const projetos = await api('GET', '/api/projetos');
    const casa = projetos.find(p => p.nome === 'Casa 975');
    assert.ok(casa && casa.itens === 28, 'Casa 975 com 28 itens');

    // ------------------------------------------------------------------ 3D e tempo real
    await page.goto(`${BASE}/projeto/${casa.id}/`);
    await page.waitForFunction(() => /salvo/.test(document.getElementById('statusTxt').textContent) && document.getElementById('dot').classList.contains('ok'), null, { timeout: 120000 });
    await foto(page, '02-casa975-3d');
    const outra = await ctx.newPage(); vigiar(outra, 'segunda aba');
    await outra.goto(`${BASE}/projeto/${casa.id}/`);
    await outra.waitForFunction(() => document.getElementById('dot').classList.contains('ok'), null, { timeout: 120000 });
    await api('PATCH', `/api/projetos/${casa.id}/itens/pia-banheiro`, { nome: 'Pia renomeada no teste' });
    await outra.waitForFunction(() => document.getElementById('list').textContent.includes('Pia renomeada no teste'), null, { timeout: 30000 });
    console.log('tempo real: ok');
    await outra.close();

    // ------------------------------------------------------------------ editor: projeto em branco, cômodos, porta, salvar
    const { id: novo } = await api('POST', '/api/projetos', { nome: 'Casa de teste', modelo: 'em-branco', largura: 10, profundidade: 25 });
    await page.goto(`${BASE}/projeto/${novo}/editor`);
    await page.waitForSelector('#svg');
    await page.click('[data-aba="comodos"]');
    await page.click('text=Adicionar cômodo');
    await page.click('[data-aba="comodos"]');
    await page.click('text=Adicionar cômodo');
    // porta: clica no meio da parede de baixo (lado da rua) do primeiro cômodo
    const alvo = await page.evaluate(() => {
      const r = document.querySelectorAll('#svg rect.parede'); let melhor = null;
      for (const e of r) { const b = e.getBoundingClientRect(); if (b.width > b.height && (!melhor || b.bottom > melhor.bottom || (b.bottom === melhor.bottom && b.left < melhor.left))) melhor = b; }
      return melhor && { x: melhor.left + melhor.width * 0.3, y: melhor.top + melhor.height / 2 };
    });
    assert.ok(alvo, 'achou uma parede horizontal');
    await page.click('[data-f="door"]');
    await page.mouse.click(alvo.x, alvo.y);
    await page.click('[data-f="win"]');
    await page.mouse.click(alvo.x + 120, alvo.y);
    await page.keyboard.press('Escape');
    await foto(page, '03-editor');
    await page.click('#bSalvar');
    await page.waitForFunction(() => document.getElementById('estado').textContent === 'salvo', null, { timeout: 15000 });
    const salvo = await api('GET', `/api/projetos/${novo}`);
    assert.equal(salvo.planta.comodos.length, 2, 'dois cômodos salvos');
    assert.equal(salvo.planta.paredes.length, 5, 'paredes geradas em volta dos cômodos (a do meio é uma só)');
    assert.equal(salvo.planta.portas.length, 1, 'uma folha de porta');
    assert.ok(salvo.planta.paredes.some(w => w[4].some(o => o[4] === 'win')), 'uma janela');
    await page.goto(`${BASE}/projeto/${novo}/`);
    await page.waitForFunction(() => document.getElementById('dot').classList.contains('ok'), null, { timeout: 120000 });
    await foto(page, '04-casa-nova-3d');

    // ------------------------------------------------------------------ pessoa que só vê
    const conv = await api('POST', '/api/usuarios', { email: 'visita@exemplo.com', nome: 'Visita' });
    await api('POST', `/api/projetos/${casa.id}/membros`, { email: 'visita@exemplo.com', papel: 'leitor' });
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const vis = await ctx2.newPage(); vigiar(vis, 'visita');
    await vis.goto(conv.link);
    await vis.waitForSelector('#form:not([hidden])');
    await vis.fill('#senha', 'outra-senha-boa-456'); await vis.fill('#senha2', 'outra-senha-boa-456');
    await vis.click('#ir'); await vis.waitForURL(/\/projetos/);
    await vis.goto(`${BASE}/projeto/${casa.id}/`);
    await vis.waitForFunction(() => document.getElementById('dot').classList.contains('ok'), null, { timeout: 120000 });
    assert.ok(await vis.evaluate(() => document.getElementById('tabAdd').hidden), 'aba Adicionar escondida para quem só vê');
    const r = await vis.evaluate(id => fetch(`/api/projetos/${id}/itens/pia-banheiro`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"x":1}' }).then(r => r.status), casa.id);
    assert.equal(r, 403, 'quem só vê não altera');
    erros.splice(0, erros.length, ...erros.filter(e => !/403/.test(e)));    // o 403 acima aparece no console
    await foto(vis, '05-celular-somente-leitura');
    const novoP = await vis.evaluate(id => fetch(`/projeto/${id}/`).then(r => r.status), novo);
    assert.equal(novoP, 404, 'projeto não compartilhado não abre');
    erros.splice(0, erros.length, ...erros.filter(e => !/404/.test(e)));

    const reais = erros.filter(e => !/favicon/.test(e));
    if (reais.length) { console.log('Erros no navegador:\n' + reais.join('\n')); process.exitCode = 1; }
    else console.log('e2e: tudo certo');
  } catch (e) {
    console.error(e); if (erros.length) console.log('Erros no navegador:\n' + erros.join('\n'));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    srv.kill('SIGTERM');
    fs.rmSync(dados, { recursive: true, force: true });
  }
})();
