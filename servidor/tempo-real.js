// Tempo real com Server-Sent Events: cada página aberta de um projeto recebe as mudanças feitas pelos outros.
// Eventos: itens (lista inteira, ao conectar), item ({id, dados} ou {id, apagado}), config, planta ({versao}), acesso (perdeu o acesso).
const MAX_POR_USUARIO = 30;

function criarHub(log) {
  const salas = new Map();          // projetoId -> Set de clientes
  const porUsuario = new Map();     // usuarioId -> quantidade de conexões

  function enviar(c, evento, dados) {
    try { c.res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`); } catch (e) { log.warn(e, 'falha ao enviar evento'); }
  }
  function sair(c) {
    const s = salas.get(c.projetoId); if (!s || !s.delete(c)) return;
    if (!s.size) salas.delete(c.projetoId);
    porUsuario.set(c.usuarioId, (porUsuario.get(c.usuarioId) || 1) - 1);
    clearInterval(c.pulso);
  }
  return {
    podeEntrar(usuarioId) { return (porUsuario.get(usuarioId) || 0) < MAX_POR_USUARIO; },
    entrar(projetoId, usuarioId, res) {
      const c = { projetoId, usuarioId, res };
      if (!salas.has(projetoId)) salas.set(projetoId, new Set());
      salas.get(projetoId).add(c);
      porUsuario.set(usuarioId, (porUsuario.get(usuarioId) || 0) + 1);
      c.pulso = setInterval(() => { try { res.write(': pulso\n\n'); } catch { /* fechou */ } }, 25000);
      res.on('close', () => sair(c));
      return c;
    },
    enviar,
    emitir(projetoId, evento, dados) { for (const c of salas.get(projetoId) || []) enviar(c, evento, dados); },
    // tira alguém da sala (perdeu o acesso ao projeto ou foi desativado)
    expulsar(projetoId, usuarioId) {
      for (const c of [...(salas.get(projetoId) || [])]) if (c.usuarioId === usuarioId) { enviar(c, 'acesso', {}); c.res.end(); sair(c); }
    },
    expulsarDeTudo(usuarioId) { for (const id of [...salas.keys()]) this.expulsar(id, usuarioId); },
    fecharProjeto(projetoId) { for (const c of [...(salas.get(projetoId) || [])]) { enviar(c, 'acesso', {}); c.res.end(); sair(c); } },
    fecharTudo() { for (const s of [...salas.values()]) for (const c of [...s]) { try { c.res.end(); } catch { /* já fechou */ } sair(c); } },
    conexoes() { let n = 0; for (const s of salas.values()) n += s.size; return n; },
  };
}

module.exports = { criarHub };
