# Casa Planta

Programa na nuvem para planejar casas em 3D: a planta (paredes, portas, janelas, cômodos), os móveis, reformas
e o orçamento. Várias pessoas usam ao mesmo tempo, cada uma com o seu login, e as mudanças aparecem para todos na hora.

Nasceu da **Casa 975**, um artefato do claude.ai; a página 3D é a mesma (`src/casa-975-3d.html`), agora servida por
um servidor com banco de dados, contas e um editor de planta para qualquer casa.

## O que dá para fazer

- **Projetos**: cada casa é um projeto. Crie em branco (só o terreno), a partir da Casa 975 ou de uma cópia baixada.
- **Planta pelas medidas**: no editor, crie os cômodos com as medidas internas; as paredes aparecem em volta sozinhas.
  Ponha portas e janelas clicando nas paredes e ajuste largura, altura, peitoril e para que lado a porta abre.
  Também dá para desenhar paredes à mão, mexer no terreno, muros, portão e telhado.
- **Planta do arquiteto**: envie a imagem, o **PDF** (com a escala do desenho, ex.: 1:100) ou o **DXF** (exportado do
  AutoCAD) como fundo do editor e desenhe por cima, com ímã nas linhas do DXF. Calibre a escala clicando em dois pontos.
  Com a chave da API da Anthropic, o **Claude lê a imagem da planta** e monta um rascunho com cômodos, portas e janelas.
- **3D**: tudo o que a Casa 975 já fazia — vistas 3D, planta, frente, fundo e caminhar; móveis com modelos próprios,
  portas e gavetas que abrem; sol real; orçamento com limite e planilha; celular.
- **Pessoas**: só entra quem é convidado. Em cada projeto, cada pessoa pode ser dono, editar ou só ver.
- **Segurança e cópias**: veja `docs/SEGURANCA.md`. Cópia do banco todo dia e versões anteriores de cada planta.

## Colocar no ar

Siga `docs/IMPLANTAR.md`. Resumo: no Render, **New → Blueprint**, escolha este repositório, preencha o seu e-mail e
uma senha inicial e espere uns minutos. O projeto Casa 975 já vem com os 28 itens de `dados/`.

## Atualizar

Siga `docs/ATUALIZAR.md`. Resumo: peça a mudança numa sessão do Claude Code; ela vira um pull request no GitHub; os
testes rodam sozinhos; ao juntar no branch principal, o Render coloca no ar depois que os testes passam.

## Rodar no computador

Node.js 22 ou mais novo:

```bash
npm install
npm run montar          # gera dist/ (páginas, three.js, fontes, leitores de PDF/DXF)
ADMIN_EMAIL=voce@exemplo.com ADMIN_SENHA_INICIAL=uma-senha-boa-123 npm start
# abra http://localhost:3000
```

Comandos úteis: `npm test` (servidor e planta), `npm run e2e` (navegador de verdade), `npm run verificar`
(sintaxe), `npm run foto` (fotos da página 3D), `npm run convidar -- pessoa@email.com` (link de convite pelo terminal).

## Pastas

```
servidor/        servidor (Fastify + SQLite): contas, projetos, móveis, tempo real, Claude, cópias de segurança
compartilhado/   planta.js: validação e geração automática da planta (usado no servidor e no editor)
web/             telas: entrar, convite, projetos, editor de planta, e a ponte da página 3D com o servidor
src/             casa-975-3d.html: a página 3D (formato do artefato do claude.ai)
modelos/         planta da Casa 975 em JSON
dados/           itens e configuração exportados do artefato (entram na primeira vez)
ferramentas/     montar.js (gera dist/), foto.js e comparar-fotos.js (testes visuais), entrada.sh (Docker)
testes/          testes automáticos (npm test) e de navegador (npm run e2e)
docs/            implantar, atualizar, segurança
```
