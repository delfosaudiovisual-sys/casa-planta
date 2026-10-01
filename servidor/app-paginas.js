// Página HTML simples para avisos (não encontrado, sem acesso). Sem scripts.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function paginaSimples(titulo, texto) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title><link rel="stylesheet" href="/css/app.css"></head>`
    + `<body class="simples"><main class="caixa"><h1>${esc(titulo)}</h1><p>${esc(texto)}</p><p><a class="btn" href="/projetos">Ir para os projetos</a></p></main></body></html>`;
}

module.exports = { paginaSimples, esc };
