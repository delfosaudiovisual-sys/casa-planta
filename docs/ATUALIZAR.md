# Como atualizar o programa

O caminho é sempre o mesmo, e é feito para não quebrar o que já funciona:

1. **Peça a mudança numa sessão do Claude Code** (claude.ai/code) escolhendo o repositório `casa-planta`.
   Ex.: "No orçamento, quero separar os gastos por cômodo" ou "o editor de planta precisa de paredes inclinadas".
   O Claude lê o `CLAUDE.md`, faz a mudança num branch separado e roda os testes.
2. **Revise o pedido de mudança (pull request)** no GitHub. O GitHub roda sozinho todos os testes
   (servidor, planta, navegador e a imagem Docker). Se algo ficar vermelho, peça ao Claude para corrigir.
3. **Junte ao branch principal** (botão **Merge**). O Render percebe, espera os testes passarem e coloca a versão nova no ar.
   Quem estiver usando é desconectado por alguns segundos e a página volta sozinha.

Nada se perde numa atualização: o banco fica no disco permanente, e mudanças na estrutura do banco
são aplicadas sozinhas quando o servidor sobe (lista `MIGRACOES` em `servidor/db.js`).

## Se uma atualização der problema

- **Voltar a versão do programa**: no Render, em **Events**, clique em **Rollback** na última versão que funcionava.
  Depois, no GitHub, desfaça a mudança (botão **Revert** no pull request).
- **Voltar a planta de um projeto**: no editor de planta, **Versões** mostra as 40 últimas versões salvas.
- **Voltar os dados**: veja "Cópias de segurança" em `docs/IMPLANTAR.md`.

## O que testar depois de uma atualização

- Entrar, abrir um projeto em 3D e ver os móveis.
- Mexer num móvel e ver a mudança aparecer em outra aba (ou no celular) na hora.
- Abrir o editor de planta, mudar algo, salvar e ver em 3D.
- No celular: abrir o projeto e o painel de baixo.

## Usar a página também no claude.ai

O arquivo `src/casa-975-3d.html` continua no formato do artefato do claude.ai. Para levar uma melhoria da página
para o artefato, peça numa sessão do Claude Code: "republique src/casa-975-3d.html no artefato" (o link está no `CLAUDE.md`).
