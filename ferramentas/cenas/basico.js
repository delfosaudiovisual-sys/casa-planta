// Cena básica: vista 3D, planta e a cozinha vista de quem está andando dentro de casa.
module.exports = async (page, foto) => {
  await page.evaluate(() => window.__casa.setView('3d'));
  await foto('01-3d');
  await page.evaluate(() => window.__casa.setView('top'));
  await foto('02-planta');
  await page.evaluate(() => {
    const C = window.__casa;
    C.setView('walk', { x: 2.9, y: 13.2 });   // em pé na sala, olhando para a cozinha
    C.walk.yaw = -0.5; C.walk.pitch = -0.35; C.updateFP();
  });
  await foto('03-cozinha');
};
