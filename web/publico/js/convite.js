// O link do convite é /convite#token: o token fica depois do #, que o navegador não manda para o servidor.
(function () {
  'use strict';
  const { api, $ } = window.Casa;
  let token = location.hash.slice(1);
  try { if (token) sessionStorage.setItem('convite', token); else token = sessionStorage.getItem('convite') || ''; } catch { /* sem armazenamento */ }
  history.replaceState(null, '', '/convite');          // tira o token da barra de endereço (fica só nesta aba, caso recarregue)
  (async () => {
    try {
      const c = await api('POST', '/api/convites/ver', { token }, { semRedirecionar: true });
      $('email').textContent = c.email; $('nome').value = c.nome || '';
      if (c.tipo === 'senha') { $('titulo').textContent = 'Criar uma senha nova'; $('nomeCampo').hidden = true; }
      $('carregando').hidden = true; $('form').hidden = false; $(c.tipo === 'senha' ? 'senha' : 'nome').focus();
    } catch (e) {
      $('carregando').hidden = true; $('invalido').textContent = e.message; $('invalido').hidden = false;
    }
  })();
  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    $('erro').hidden = true;
    if ($('senha').value !== $('senha2').value) { $('erro').textContent = 'As duas senhas estão diferentes.'; $('erro').hidden = false; return; }
    $('ir').disabled = true;
    try {
      await api('POST', '/api/convites/aceitar', { token, nome: $('nome').value, senha: $('senha').value }, { semRedirecionar: true });
      try { sessionStorage.removeItem('convite'); } catch { /* sem armazenamento */ }
      location.href = '/projetos';
    } catch (err) { $('erro').textContent = err.message; $('erro').hidden = false; }
    finally { $('ir').disabled = false; }
  });
}());
