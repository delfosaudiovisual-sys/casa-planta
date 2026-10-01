# Casa 975

Modelo 3D da casa para planejar móveis, reformas e orçamento. Este repositório é o ponto de partida para
transformar a página (que hoje é um artefato do claude.ai) num programa.

## O que tem aqui

- `src/casa-975-3d.html`: a página inteira, igual à versão publicada (versão 19).
- `dados/itens.json`: os seus 28 itens exportados em 01/10/2026, com medidas, posições, preços e estimativas.
- `dados/config-casa.json`: configuração (sol, latitude, limite do orçamento, portas e janelas alteradas).
- `CLAUDE.md`: guia técnico que o Claude Code lê sozinho ao abrir a sessão. Explica como o código está organizado e o que mudar.
- `ferramentas/`: scripts para gerar a página completa, testar e tirar fotos de tela automaticamente.

## Como abrir numa sessão do Claude Code na nuvem

A sessão na nuvem trabalha em cima de um repositório do GitHub. Então:

1. Descompacte o zip.
2. No GitHub, crie um repositório novo, **privado** (ele tem seus preços e links), por exemplo `casa-975`.
3. Na página do repositório vazio, clique em **uploading an existing file** e arraste para lá tudo o que está **dentro**
   da pasta `casa-975` (as pastas `src`, `dados`, `ferramentas` e os arquivos). Confirme em **Commit changes**.
4. Em claude.ai/code, escolha o repositório `casa-975` e comece uma sessão.
   Na primeira vez, ele pede para conectar a sua conta do GitHub.

## Primeiro pedido sugerido

> Leia o CLAUDE.md. Quero transformar a Casa 975 num programa para Windows que funcione sem internet,
> salvando os dados num arquivo no computador e importando dados/itens.json na primeira vez.
> Mantenha tudo o que a página já faz. Antes de começar, me diga o plano e as opções (Electron, Tauri ou app pelo navegador).

## Bom saber

- O artefato continua funcionando normalmente. Os dados de lá são os "de verdade" até você migrar.
  Se mexer no artefato depois de 01/10, peça uma nova exportação dos itens antes de importar no programa.
- As funções que usam o Claude dentro da página (medidas e preços automáticos) só funcionam no claude.ai.
  No programa, elas saem ou passam a usar uma chave da API da Anthropic, que é paga por uso.
