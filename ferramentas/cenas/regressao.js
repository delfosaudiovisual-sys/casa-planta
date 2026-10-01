// Cena de regressão: as mesmas vistas sempre, para comparar fotos antes e depois de uma mudança
// (node ferramentas/comparar-fotos.js pasta-antes pasta-depois).
module.exports = async (page, foto) => {
  await page.evaluate(() => window.__casa.setView('3d'));
  await foto('r01-3d');
  await page.evaluate(() => window.__casa.setView('top'));
  await foto('r02-planta');
  await page.evaluate(() => window.__casa.setView('front'));
  await foto('r03-frente');
  await page.evaluate(() => window.__casa.setView('back'));
  await foto('r04-fundo');
  await page.evaluate(() => { window.__casa.setView('3d'); document.getElementById('tRoof').click(); });
  await foto('r05-telhado');
  await page.evaluate(() => { document.getElementById('tRoof').click(); document.getElementById('tCut').click(); });
  await foto('r06-paredes-baixas');
  await page.evaluate(() => { document.getElementById('tCut').click(); const C = window.__casa; C.setView('walk'); });
  await foto('r07-entrada');
  await page.evaluate(() => { const C = window.__casa; C.setView('walk', {x: 2.9, y: 13.2}); C.walk.yaw = -0.5; C.walk.pitch = -0.35; C.updateFP(); });
  await foto('r08-cozinha');
};
