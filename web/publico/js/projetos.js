(function () {
  'use strict';
  const { api, el, aviso, $, quando } = window.Casa;
  const PAPEL = { dono: 'dono', editor: 'pode editar', leitor: 'só vê' };
  let eu = null;

  function dialogo(titulo, corpo, botoes) {
    const d = el('dialog', { 'aria-label': titulo }, el('h2', { texto: titulo }), corpo, el('div', { class: 'rodape' }, botoes));
    d.addEventListener('close', () => d.remove());
    document.body.append(d); d.showModal();
    return d;
  }
  const fechar = d => el('button', { class: 'btn', type: 'button', texto: 'Fechar', onclick: () => d.close() });
  function erroEm(caixa, e) { caixa.textContent = e.message; caixa.hidden = false; }
  function linkParaCopiar(link, validoAte) {
    const inp = el('input', { value: link, readOnly: true, 'aria-label': 'Link' });
    return el('div', {},
      el('p', { class: 'nota', texto: `Envie este link para a pessoa (WhatsApp ou e-mail). Ele vale uma vez só, até ${quando(validoAte)}. Quem abrir o link cria a própria senha.` }),
      el('div', { class: 'copiar' }, inp, el('button', { class: 'btn', type: 'button', texto: 'Copiar', onclick: async () => {
        inp.select(); try { await navigator.clipboard.writeText(link); aviso('Link copiado'); } catch { document.execCommand('copy'); aviso('Link copiado'); }
      } })));
  }

  // ------------------------------------------------------------------ projetos
  async function carregar() {
    const lista = await api('GET', '/api/projetos');
    const box = $('lista'); box.replaceChildren();
    if (!lista.length) box.append(el('div', { class: 'vazio' }, el('p', { texto: 'Nenhum projeto ainda.' }), el('button', { class: 'btn primario', type: 'button', texto: 'Criar o primeiro projeto', onclick: novoProjeto })));
    for (const p of lista) {
      const m = v => String(v).replace('.', ',');
      box.append(el('article', { class: 'projeto' },
        el('h3', { texto: p.nome }),
        el('div', { class: 'info', texto: `lote ${m(p.largura)} × ${m(p.profundidade)} m · ${p.itens} ${p.itens === 1 ? 'item' : 'itens'} · ${p.pessoas} ${p.pessoas === 1 ? 'pessoa' : 'pessoas'}` }),
        el('div', { class: 'info' }, el('span', { class: 'pilula' + (p.papel === 'leitor' ? ' cinza' : ''), texto: PAPEL[p.papel] }), ` alterado em ${quando(p.atualizado_em)}`),
        el('div', { class: 'acoes' },
          el('a', { class: 'btn primario pequeno', href: `/projeto/${p.id}/`, texto: 'Abrir em 3D' }),
          el('a', { class: 'btn pequeno', href: `/projeto/${p.id}/editor`, texto: p.papel === 'leitor' ? 'Ver planta' : 'Editar planta' }),
          el('button', { class: 'btn pequeno', type: 'button', texto: 'Compartilhar', onclick: () => compartilhar(p) }),
          el('button', { class: 'btn pequeno', type: 'button', texto: 'Mais…', onclick: () => mais(p) }))));
    }
  }

  function novoProjeto() {
    const erro = el('div', { class: 'aviso', hidden: true, role: 'alert' });
    const nome = el('input', { value: 'Minha casa', maxLength: 80 });
    const radio = (v, titulo, desc, marcado) => el('label', {}, el('input', { type: 'radio', name: 'modelo', value: v, checked: !!marcado }), el('span', {}, el('b', { texto: titulo }), el('small', { texto: desc })));
    const larg = el('input', { type: 'number', value: 10, min: 2, max: 200, step: 0.01 }), prof = el('input', { type: 'number', value: 25, min: 2, max: 300, step: 0.01 });
    const arquivo = el('input', { type: 'file', accept: '.json,application/json' });
    const medidas = el('div', { class: 'grade2' }, el('label', { class: 'campo' }, 'Largura do terreno (m)', larg), el('label', { class: 'campo' }, 'Profundidade (m)', prof));
    const campoArq = el('label', { class: 'campo', hidden: true }, 'Arquivo .json (cópia baixada de um projeto)', arquivo);
    const opcoes = el('div', { class: 'opcoes' },
      radio('em-branco', 'Em branco', 'Só o terreno. Depois você desenha os cômodos, envia a imagem ou o PDF da planta, ou pede para o Claude ler a planta.', true),
      radio('casa-975', 'Cópia da Casa 975', 'Começa com a planta da Casa 975, sem os móveis.'),
      radio('arquivo', 'Abrir uma cópia baixada', 'Um arquivo .json salvo pelo botão "Baixar cópia" de um projeto.'));
    opcoes.addEventListener('change', () => { const v = opcoes.querySelector('input:checked').value; medidas.hidden = v !== 'em-branco'; campoArq.hidden = v !== 'arquivo'; });
    const ir = el('button', { class: 'btn primario', type: 'button', texto: 'Criar' });
    const d = dialogo('Novo projeto', el('div', {}, el('label', { class: 'campo' }, 'Nome', nome), opcoes, medidas, campoArq, erro), [el('button', { class: 'btn', type: 'button', texto: 'Cancelar', onclick: () => d.close() }), ir]);
    ir.onclick = async () => {
      erro.hidden = true; ir.disabled = true;
      try {
        const modelo = opcoes.querySelector('input:checked').value, corpo = { nome: nome.value, modelo };
        if (modelo === 'em-branco') { corpo.largura = Number(larg.value); corpo.profundidade = Number(prof.value); }
        if (modelo === 'arquivo') {
          const f = arquivo.files[0]; if (!f) throw new Error('Escolha o arquivo.');
          try { corpo.arquivo = JSON.parse(await f.text()); } catch { throw new Error('Não consegui ler esse arquivo.'); }
        }
        const { id } = await api('POST', '/api/projetos', corpo);
        location.href = modelo === 'em-branco' ? `/projeto/${id}/editor` : `/projeto/${id}/`;
      } catch (e) { erroEm(erro, e); ir.disabled = false; }
    };
  }

  async function compartilhar(p) {
    const erro = el('div', { class: 'aviso', hidden: true, role: 'alert' });
    const tabela = el('table', { class: 'lista' });
    const dono = p.papel === 'dono';
    async function listar() {
      const ms = await api('GET', `/api/projetos/${p.id}/membros`);
      tabela.replaceChildren(el('tr', {}, el('th', { texto: 'Pessoa' }), el('th', { texto: 'Acesso' }), el('th', {})));
      for (const m of ms) {
        const sel = el('select', { 'aria-label': 'Acesso de ' + m.nome, disabled: !dono },
          Object.entries(PAPEL).map(([v, t]) => el('option', { value: v, texto: t, selected: v === m.papel })));
        sel.onchange = async () => { try { await api('PATCH', `/api/projetos/${p.id}/membros/${m.id}`, { papel: sel.value }); aviso('Acesso alterado'); } catch (e) { erroEm(erro, e); listar(); } };
        const tirar = (dono || m.id === eu.id) ? el('button', { class: 'btn pequeno perigo', type: 'button', texto: m.id === eu.id ? 'Sair' : 'Tirar', onclick: async () => {
          if (!confirm(m.id === eu.id ? 'Sair deste projeto? Você perde o acesso a ele.' : `Tirar o acesso de ${m.nome}?`)) return;
          try { await api('DELETE', `/api/projetos/${p.id}/membros/${m.id}`); if (m.id === eu.id) { d.close(); carregar(); } else listar(); } catch (e) { erroEm(erro, e); }
        } }) : null;
        tabela.append(el('tr', {}, el('td', {}, el('div', { texto: m.nome }), el('div', { class: 'nota', texto: m.email })), el('td', {}, sel), el('td', {}, tirar)));
      }
    }
    const email = el('input', { type: 'email', placeholder: 'email@da.pessoa', 'aria-label': 'E-mail' });
    const papel = el('select', { 'aria-label': 'Acesso' }, el('option', { value: 'editor', texto: 'pode editar' }), el('option', { value: 'leitor', texto: 'só vê' }), el('option', { value: 'dono', texto: 'dono' }));
    const add = el('button', { class: 'btn primario', type: 'button', texto: 'Dar acesso', onclick: async () => {
      erro.hidden = true;
      try { await api('POST', `/api/projetos/${p.id}/membros`, { email: email.value, papel: papel.value }); email.value = ''; listar(); aviso('Acesso liberado'); } catch (e) { erroEm(erro, e); }
    } });
    const corpo = el('div', {}, el('div', { class: 'rolagem' }, tabela),
      dono ? el('div', { style: 'margin-top:14px' }, el('h3', { texto: 'Dar acesso a mais alguém' }),
        el('p', { class: 'nota', texto: 'A pessoa precisa já ter conta no sistema (o administrador convida em "Pessoas").' }),
        el('div', { class: 'grade2' }, email, papel), el('div', { class: 'linha', style: 'margin-top:8px' }, add)) : el('p', { class: 'nota', texto: 'Só o dono do projeto muda quem tem acesso.' }),
      erro);
    const d = dialogo(`Compartilhar "${p.nome}"`, corpo, []);
    d.querySelector('.rodape').append(fechar(d));
    listar().catch(e => erroEm(erro, e));
  }

  function mais(p) {
    const erro = el('div', { class: 'aviso', hidden: true, role: 'alert' });
    const nome = el('input', { value: p.nome, maxLength: 80, disabled: p.papel === 'leitor' });
    const acoes = el('div', { class: 'linha' },
      p.papel !== 'leitor' && el('button', { class: 'btn', type: 'button', texto: 'Salvar nome', onclick: async () => {
        try { await api('PATCH', `/api/projetos/${p.id}`, { nome: nome.value }); d.close(); carregar(); } catch (e) { erroEm(erro, e); }
      } }),
      el('button', { class: 'btn', type: 'button', texto: 'Fazer uma cópia', onclick: async () => {
        try { await api('POST', `/api/projetos/${p.id}/duplicar`); d.close(); carregar(); aviso('Cópia criada'); } catch (e) { erroEm(erro, e); }
      } }),
      el('a', { class: 'btn', href: `/api/projetos/${p.id}/exportar`, texto: 'Baixar cópia (.json)' }));
    const apagar = p.papel === 'dono' ? el('div', { style: 'margin-top:18px' }, el('h3', { texto: 'Apagar o projeto' }),
      el('p', { class: 'nota', texto: 'Apaga a planta, os móveis e o orçamento para todo mundo. Não tem como desfazer. Baixe uma cópia antes, se quiser guardar.' }),
      el('button', { class: 'btn perigo', type: 'button', texto: 'Apagar…', onclick: async () => {
        const c = prompt(`Para apagar, escreva o nome do projeto: ${p.nome}`); if (c == null) return;
        try { await api('DELETE', `/api/projetos/${p.id}`, { confirmar: c }); d.close(); carregar(); aviso('Projeto apagado'); } catch (e) { erroEm(erro, e); }
      } })) : null;
    const d = dialogo(p.nome, el('div', {}, el('label', { class: 'campo' }, 'Nome do projeto', nome), acoes, apagar, erro), []);
    d.querySelector('.rodape').append(fechar(d));
  }

  // ------------------------------------------------------------------ conta
  function minhaConta() {
    const erro = el('div', { class: 'aviso', hidden: true, role: 'alert' });
    const nome = el('input', { value: eu.nome, maxLength: 80, autocomplete: 'name' });
    const atual = el('input', { type: 'password', autocomplete: 'current-password' }), nova = el('input', { type: 'password', autocomplete: 'new-password' }), nova2 = el('input', { type: 'password', autocomplete: 'new-password' });
    const corpo = el('div', {},
      el('p', { class: 'nota', texto: eu.email }),
      el('label', { class: 'campo' }, 'Seu nome', nome),
      el('button', { class: 'btn', type: 'button', texto: 'Salvar nome', onclick: async () => {
        try { await api('PATCH', '/api/eu', { nome: nome.value }); aviso('Nome salvo'); iniciar(); } catch (e) { erroEm(erro, e); }
      } }),
      el('h3', { texto: 'Trocar a senha' }),
      el('label', { class: 'campo' }, 'Senha atual', atual), el('label', { class: 'campo' }, 'Senha nova (pelo menos 10 caracteres)', nova), el('label', { class: 'campo' }, 'Repita a senha nova', nova2),
      el('button', { class: 'btn primario', type: 'button', texto: 'Trocar a senha', onclick: async () => {
        erro.hidden = true;
        if (nova.value !== nova2.value) { erroEm(erro, new Error('As duas senhas novas estão diferentes.')); return; }
        try { await api('POST', '/api/eu/senha', { atual: atual.value, nova: nova.value }); aviso('Senha trocada. Os outros aparelhos vão pedir para entrar de novo.', 5000); d.close(); } catch (e) { erroEm(erro, e); }
      } }), erro);
    const d = dialogo('Minha conta', corpo, []);
    d.querySelector('.rodape').append(fechar(d));
  }

  // ------------------------------------------------------------------ administração
  async function pessoas() {
    const ps = await api('GET', '/api/usuarios');
    const t = $('pessoas');
    t.replaceChildren(el('tr', {}, ['Nome', 'E-mail', 'Situação', 'Projetos', 'Último acesso', ''].map(h => el('th', { texto: h }))));
    for (const p of ps) {
      const sit = !p.ativo ? 'desativada' : p.pendente ? 'convite pendente' : p.admin ? 'administrador' : 'ativa';
      const acoes = el('div', { class: 'linha' },
        p.ativo && el('button', { class: 'btn pequeno', type: 'button', texto: p.pendente ? 'Link do convite' : 'Link de nova senha', onclick: async () => {
          try { const r = await api('POST', `/api/usuarios/${p.id}/link`); const d = dialogo(`Link para ${p.nome}`, linkParaCopiar(r.link, r.validoAte), []); d.querySelector('.rodape').append(fechar(d)); } catch (e) { aviso(e.message); }
        } }),
        p.id !== eu.id && p.ativo && el('button', { class: 'btn pequeno', type: 'button', texto: p.admin ? 'Tirar administrador' : 'Tornar administrador', onclick: () => alterar(p, { admin: !p.admin }) }),
        p.id !== eu.id && el('button', { class: 'btn pequeno' + (p.ativo ? ' perigo' : ''), type: 'button', texto: p.ativo ? 'Desativar' : 'Reativar', onclick: () => {
          if (p.ativo && !confirm(`Desativar ${p.nome}? A pessoa sai na hora de todos os aparelhos e não consegue mais entrar.`)) return;
          alterar(p, { ativo: !p.ativo });
        } }));
      t.append(el('tr', {}, el('td', { texto: p.nome }), el('td', { class: 'mono', texto: p.email }), el('td', {}, el('span', { class: 'pilula' + (p.ativo ? '' : ' cinza'), texto: sit })),
        el('td', { texto: String(p.projetos) }), el('td', { class: 'nota', texto: p.visto_em ? quando(p.visto_em) : '—' }), el('td', {}, acoes)));
    }
  }
  async function alterar(p, mud) { try { await api('PATCH', `/api/usuarios/${p.id}`, mud); pessoas(); } catch (e) { aviso(e.message, 5000); } }

  function convidar() {
    const erro = el('div', { class: 'aviso', hidden: true, role: 'alert' });
    const email = el('input', { type: 'email', autocomplete: 'off' }), nome = el('input', { maxLength: 80 }), admin = el('input', { type: 'checkbox' });
    const resultado = el('div', {});
    const ir = el('button', { class: 'btn primario', type: 'button', texto: 'Criar convite' });
    const d = dialogo('Convidar pessoa', el('div', {}, el('label', { class: 'campo' }, 'E-mail', email), el('label', { class: 'campo' }, 'Nome', nome),
      el('label', { class: 'marca' }, admin, 'Administrador (pode convidar e desativar pessoas)'), erro, resultado), [el('button', { class: 'btn', type: 'button', texto: 'Fechar', onclick: () => d.close() }), ir]);
    ir.onclick = async () => {
      erro.hidden = true; ir.disabled = true;
      try {
        const r = await api('POST', '/api/usuarios', { email: email.value, nome: nome.value, admin: admin.checked });
        resultado.replaceChildren(el('div', { class: 'sucesso', texto: 'Convite criado. Depois que a pessoa criar a senha, compartilhe os projetos com ela.' }), linkParaCopiar(r.link, r.validoAte));
        ir.hidden = true; pessoas();
      } catch (e) { erroEm(erro, e); ir.disabled = false; }
    };
  }

  async function registro() {
    const rs = await api('GET', '/api/admin/registro');
    $('registro').replaceChildren(el('tr', {}, ['Quando', 'Quem', 'O quê', 'Detalhe'].map(h => el('th', { texto: h }))),
      ...rs.map(r => el('tr', {}, el('td', { class: 'nota', texto: quando(r.quando) }), el('td', { texto: r.nome || '—' }), el('td', { texto: r.acao }), el('td', { class: 'nota mono', texto: [r.alvo, r.detalhe].filter(Boolean).join(' · ') }))));
  }

  // ------------------------------------------------------------------ início
  async function iniciar() {
    eu = await api('GET', '/api/eu');
    $('quem').textContent = eu.nome;
    $('versao').textContent = `Casa Planta ${eu.versao}`;
    if (eu.admin) { $('admin').hidden = false; pessoas(); }
  }
  $('bNovo').onclick = novoProjeto;
  $('bConta').onclick = minhaConta;
  $('bSair').onclick = async () => { await api('POST', '/api/sair'); location.href = '/entrar'; };
  $('bConvidar').onclick = convidar;
  $('bCopia').onclick = () => { location.href = '/api/admin/copia'; };
  document.querySelector('#admin details').addEventListener('toggle', e => { if (e.target.open) registro().catch(er => aviso(er.message)); });
  iniciar().then(carregar).catch(e => aviso(e.message, 6000));
}());
