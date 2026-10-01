(function () {
  'use strict';
  const { api, $, destinoSeguro } = window.Casa;
  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    $('erro').hidden = true; $('ir').disabled = true;
    try {
      await api('POST', '/api/entrar', { email: $('email').value, senha: $('senha').value }, { semRedirecionar: true });
      location.href = destinoSeguro(new URLSearchParams(location.search).get('volta'));
    } catch (err) {
      $('erro').textContent = err.message; $('erro').hidden = false; $('senha').select();
    } finally { $('ir').disabled = false; }
  });
}());
