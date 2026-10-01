// Páginas HTML. Os modelos ficam em dist/paginas (gerados por "npm run montar" a partir de web/paginas e src/).
// __V__ vira a versão do programa (força o navegador a buscar os arquivos novos depois de uma atualização).
const fs = require('fs');
const path = require('path');
const { exigirPapel } = require('../acesso');
const { ID_PROJETO } = require('../util');
const { paginaSimples } = require('../app-paginas');

module.exports = async function (app) {
  const { cfg, db } = app;
  const pasta = path.join(cfg.webDir, 'paginas');
  let marca = cfg.versao;
  try { marca = fs.readFileSync(path.join(cfg.webDir, 'montagem.txt'), 'utf8').trim() || marca; } catch { /* sem montagem */ }
  const cache = new Map();
  function modelo(nome) {
    if (cfg.producao && cache.has(nome)) return cache.get(nome);
    let html;
    try { html = fs.readFileSync(path.join(pasta, nome), 'utf8').split('__V__').join(encodeURIComponent(marca)); }
    catch { html = paginaSimples('Programa não montado', 'Rode "npm run montar" para gerar as páginas.'); }
    cache.set(nome, html);
    return html;
  }
  const html = (reply, nome, troca = {}) => {
    let h = modelo(nome);
    for (const [k, v] of Object.entries(troca)) h = h.split(k).join(v);
    return reply.header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(h);
  };
  const paraEntrar = (req, reply) => reply.redirect('/entrar?volta=' + encodeURIComponent(req.url));

  app.get('/', async (req, reply) => reply.redirect(req.usuario ? '/projetos' : '/entrar'));
  app.get('/entrar', async (req, reply) => (req.usuario ? reply.redirect('/projetos') : html(reply, 'entrar.html')));
  app.get('/convite', async (req, reply) => html(reply, 'convite.html'));
  app.get('/projetos', async (req, reply) => (req.usuario ? html(reply, 'projetos.html') : paraEntrar(req, reply)));

  const semAcesso = reply => reply.code(404).type('text/html; charset=utf-8').send(paginaSimples('Projeto não encontrado', 'Este projeto não existe ou você não tem acesso a ele. Peça ao dono do projeto para compartilhar com você.'));
  const doProjeto = (req, reply, minimo, fn) => {
    if (!req.usuario) return paraEntrar(req, reply);
    if (!ID_PROJETO.test(req.params.id)) return semAcesso(reply);
    try { exigirPapel(app, req, req.params.id, minimo); } catch (e) { if (e.statusCode === 403 || e.statusCode === 404) return semAcesso(reply); throw e; }
    return fn();
  };

  app.get('/projeto/:id', async (req, reply) => reply.redirect(`/projeto/${encodeURIComponent(req.params.id)}/`));
  app.get('/projeto/:id/', async (req, reply) => doProjeto(req, reply, 'leitor', () => html(reply, 'casa.html', { __ID__: req.params.id })));
  app.get('/projeto/:id/editor', async (req, reply) => doProjeto(req, reply, 'leitor', () => html(reply, 'editor.html', { __ID__: req.params.id })));

  // dados que a página 3D precisa antes de começar (a planta define as paredes; o resto chega pelo tempo real)
  app.get('/projeto/:id/inicio.js', async (req, reply) => {
    const { papel, usuario } = exigirPapel(app, req, req.params.id);
    const p = db.prepare('SELECT id, nome, planta, planta_versao FROM projetos WHERE id = ?').get(req.params.id);
    const planta = { ...JSON.parse(p.planta), nome: p.nome, chave: 'casa-' + p.id };
    const projeto = { id: p.id, nome: p.nome, papel, plantaVersao: p.planta_versao, usuario: { nome: usuario.nome }, claude: !!app.claude };
    reply.header('Cache-Control', 'no-store').type('application/javascript; charset=utf-8');
    return `window.__PLANTA = ${JSON.stringify(planta)};\nwindow.__PROJETO = ${JSON.stringify(projeto)};\n`;
  });
};
