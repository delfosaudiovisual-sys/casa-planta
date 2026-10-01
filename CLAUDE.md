# Casa Planta — guia para o Claude Code

Programa na nuvem para planejar casas em 3D (planta, móveis, reformas, orçamento), com várias pessoas usando ao mesmo
tempo. Começou como o artefato **Casa 975** do claude.ai; a página 3D continua no formato do artefato e o servidor
atende o `window.claude` que ela usa.

- **Dono leigo em programação.** Interface, textos, mensagens de erro, nomes de variáveis novas e mensagens de commit em
  **português do Brasil**, tom direto e simples. Explique as mudanças sem jargão.
- **Não ponha endereço, bairro nem cidade** em lugar nenhum (a página pode ser compartilhada).
- Artefato publicado: https://claude.ai/code/artifact/6090c9a3-e226-4d77-a3aa-aba852fae084 (versão 19). Se a ferramenta
  `Artifact` existir na sessão, dá para republicar `src/casa-975-3d.html` nele; o banco do artefato é a coleção `itens`
  (ferramenta `ArtifactData`).

## Comandos

```bash
npm install
npm run verificar     # sintaxe: <script> da página 3D + node --check em todos os .js
npm run montar        # gera dist/ (obrigatório antes de npm start e de npm run e2e)
npm test              # testes do servidor e da planta (node:test, sem navegador; ~10 s)
npm run e2e           # navegador de verdade: login, 3D, tempo real, editor, PDF/DXF/calibração (~3 min)
npm start             # servidor em http://localhost:3000 (ADMIN_EMAIL e ADMIN_SENHA_INICIAL criam o admin na 1ª vez)
npm run foto          # fotos da página 3D em ferramentas/fotos/ (cena básica)
npm run convidar -- pessoa@email.com [--admin]   # link de convite pelo terminal
```

No ambiente da nuvem o Chromium está em `/opt/pw-browsers` e o Playwright já o acha; se não achar, use
`CHROMIUM_PATH=/caminho/do/chrome`. O WebGL roda em software (SwiftShader): lento, mas determinístico.

**Antes de dar um trabalho por pronto:** `npm run verificar && npm test`, e `npm run montar && npm run e2e` se mexeu em
telas, ponte ou servidor. Mexeu na página 3D: rode a regressão de imagens (abaixo) e olhe as fotos da área mexida com a
ferramenta de leitura de imagem. O GitHub Actions (`.github/workflows/testes.yml`) roda tudo isso e monta a imagem Docker;
o Render só publica quando passa.

### Regressão de imagens da página 3D

```bash
node ferramentas/foto.js ferramentas/cenas/regressao.js     # antes da mudança; copie ferramentas/fotos/ para outra pasta
# ... mudança ...
node ferramentas/foto.js ferramentas/cenas/regressao.js     # depois
node ferramentas/comparar-fotos.js pasta-antes ferramentas/fotos 0     # 0% = idêntico (o render é determinístico)
PLANTA=testes/plantas/teste-10x30.json ITENS=/dev/null node ferramentas/foto.js ferramentas/cenas/regressao.js   # outra planta
```

## Estrutura

```
servidor/           Fastify 5 + better-sqlite3 (um arquivo: DATA_DIR/casa.db)
  index.js          sobe tudo; app.js monta o Fastify (testes usam app.inject sem porta)
  config.js         variáveis de ambiente (lista completa em .env.exemplo)
  db.js             MIGRACOES (só acrescente no fim; nunca altere uma que já existe), registrar()
  sessoes.js        cookie de sessão (token aleatório; no banco só o sha256), exigirUsuario/exigirAdmin
  acesso.js         papéis por projeto: leitor < editor < dono; sem acesso responde 404
  validacao.js      limparItem / limparConfig (aceita campos novos com nome simples; confere link e cor)
  tempo-real.js     hub de Server-Sent Events por projeto
  claude.js         API da Anthropic (modelo em CLAUDE_MODELO, padrão claude-opus-5-5, com fallbacks: 'default')
  semente.js        1ª vez: admin pelas variáveis + projeto Casa 975 com dados/itens.json e dados/config-casa.json
  backup.js         cópia diária em DATA_DIR/copias; cli.js = npm run convidar
  rotas/            conta (entrar, convites), usuarios (admin), projetos (+membros, planta, versões, exportar),
                    itens (+config, eventos SSE, importar), referencias (planta de fundo), claude, admin, paginas
compartilhado/planta.js   UMD (require no servidor, window.Planta no editor): validarPlanta, derivar, gerarFolhas,
                    inferirFolhas, limparJuntas, paredesDosComodos, plantaEmBranco, plantaDaLeitura
web/paginas/        modelos HTML (entrar, convite, projetos, editor); o servidor troca __V__ (versão) e __ID__ (projeto)
web/publico/        css/app.css, js/comum.js (api, el), js/projetos.js, js/editor.js, js/ponte.js, favicon
src/casa-975-3d.html      página 3D (formato do artefato: sem <html>/<head>/<body>, scripts inline)
ferramentas/montar.js     gera dist/paginas e dist/publico: separa os 2 <script> da página 3D em casa/texturas.js e
                    casa/app.js, troca CDN do three.js e Google Fonts por arquivos locais, insere o link "←" e o
                    cartão "Planta da casa"; copia pdf.js (legacy), dxf-parser e fontes @fontsource
modelos/casa-975.json     a mesma planta de PLANTA_975 na página (um teste confere que são iguais)
testes/             *.test.js (npm test), e2e/navegador.js e e2e/fundo.js (npm run e2e), plantas/ e arquivos/ de exemplo
```

## Regras de segurança (não quebrar)

- **CSP sem scripts inline** (`script-src 'self'`): nada de `onclick=` em HTML nem `<script>` inline nas páginas de
  `web/`. A página 3D pode ter inline em `src/` porque o `montar.js` extrai; se ela ganhar um 3º `<script>`, ajuste o
  `montar.js` (ele confere que são 2). Biblioteca nova de navegador: copie em `montar.js` para `dist/publico/vendor`
  (nada de CDN). `style-src` aceita inline.
- **Nada digitado vira HTML**: use `textContent`/`el()`/`mk()`; `innerHTML` só com texto fixo do código.
- **Toda rota de projeto chama `exigirPapel(app, req, id, papelMinimo)`**; escrita exige `editor`, compartilhar/apagar `dono`.
- **Pedidos que mudam algo** passam pela conferência de origem em `app.js` (não desligue).
- **Entrada de dados** sempre por `limparItem`/`limparConfig`/`validarPlanta` ou schema do Fastify.
- Chave da API da Anthropic só no servidor (variável de ambiente); nunca em arquivo do repositório.

## Página 3D (`src/casa-975-3d.html`)

- ~680 KB; algumas linhas enormes (texturas em base64 em `PHOTO_TEX`, perto da linha 495). Leia por trechos e edite
  com substituições exatas de trechos únicos (Python com `assert s.count(antigo) == 1` funciona bem).
- `foto.js` injeta `window.__casa` trocando `const clock = new THREE.Clock();`. Se renomear algo da lista `EXPOE`,
  atualize a lista. "Failed to load resource" no teste é esperado (fontes do Google bloqueadas).
- Animações se testam chamando as funções direto: `stepDoors(1)`, `stepFurn(1)`, `walkStep(...)`.

### Planta: de onde vem a geometria

Logo no começo do script: `PLANTA_975` (a Casa 975 em dados) e `lerPlanta(window.__PLANTA)` → `PL`. No programa,
`window.__PLANTA` vem de `/projeto/:id/inicio.js`; sem ela (artefato), vale a Casa 975. Daí saem `H`, `LW`, `LD`,
`WALLS`, `DOORS`, `ROOMS`, `INTERIOR`, muros, pilares, portão, medidor, telhado (`ROOF`), boxes, vizinhança,
câmeras (`VIEW_POS`, `VS`), sombra (`SHADOW_E`), limites do Caminhar (`NAV`, `NEIGHBOR`, `collide`), mapa e entrada.
`CHAVE` é o prefixo do localStorage (`casa975` no artefato; `casa-<id>` por projeto no programa).

Formato da planta (metros; plano: `x` esquerda→direita olhando da rua, `y` rua→fundo):

| campo | significado |
|---|---|
| `lote` `{largura, profundidade}`, `peDireito`, `alturaPorta`, `alturaMuro` | medidas gerais |
| `paredes` | `[x0,y0,x1,y1, aberturas]`, retângulo alinhado aos eixos (sem parede inclinada); abertura `[a,b,base,topo,tipo,meta?]` com `a,b` absolutos ao longo do eixo maior; tipo `win`, `basc`, `door`, `glass`; `meta` (só porta) `{dob:'a'|'b'|null, lado:1|-1}` |
| `portas` | folhas de madeira `[hx,hy,largura,ânguloAberta,ânguloFechada]`; o editor e o servidor geram pela `meta` (`gerarFolhas`); plantas antigas sem `meta` passam por `inferirFolhas` |
| `comodos` | `{id,nome,r:[x0,y0,x1,y1],dims?,interno?,parede?:'azulejo',piso?:'cimento',coberto?,rotulo?:false\|[x,y],atalho?:false}` |
| `azulejos`, `pisosExternos`, `forros` | retângulos; `luminarias` `[[x,y]]`; `muros` retângulos; `pilares` `[x0,y0,x1,y1,altura?]` |
| `portao`, `medidor` | `[a,b]` em x na frente do lote, ou null |
| `telhado` | `{x0,x1,frente,fundo,cumeeira,beiral,inclinacao}` (duas águas, cumeeira de lado a lado) ou null |
| `boxes` | box de vidro de correr `{eixo:'x'\|'y', a, b, c}` |
| `vizinhanca` | `'geminadas'` (cópias da casa dos lados e do outro lado da rua) ou `'nenhuma'` |
| `entrada` `{x,y,rumo}`, `lados` `{esquerda,direita}` | início do Caminhar; nomes dos lados no ajuste do sol |
| `auto`, `terreno`, `paredesPelosComodos`, `espessura`, `referencia` | do editor: gerar pisos/forros/luzes/muros pelos cômodos; refazer paredes quando um cômodo muda; planta de fundo `{id,tipo:'imagem'\|'dxf',x,y,escala,opacidade,rot}` |

Os ajustes de portas e janelas feitos no 3D (`config.aberturas`, ids `w{parede}o{abertura}`) são zerados pelo servidor
quando a planta é salva, porque os índices mudam.

### Mapa do código (seções marcadas com `// ------------------------------------------------------------------`)

1. **Geometria**: `PLANTA_975`, `lerPlanta`, `PL` e as constantes derivadas. 2. **Renderizador, câmeras, luzes, céu**.
3. **Texturas e materiais** (`TX`, `MAT`, `fmat`). 4. **Casa**: `MeshBuilder`, `addPB`, `surfaceAt` (azulejo por
`parede:'azulejo'` ou zonas `azulejos`), `buildShellInto`, `SOLIDS`/`WALL_SOLIDS`/`OBST`, pisos, forros, luminárias,
telhado, boxes, vizinhança (`context`). 5. **Portas da casa** (`DOOR_T`, `registerDoor`; ids `p0…`, `vidro`, `vidro2…`,
`box`, `box2…`). 6. **Portas e janelas editáveis** (`OPENINGS`, `applyOpenings`). 7. **Modelos dos móveis** (`TIPOS`,
`PRESETS`, `MODELS`, `VARIANTS`). 8. **Formatos L/U/chaise** (`SHAPES`, `runsOf`, `partsOf`). 9. **Portas e gavetas dos
móveis** (`furnT`, `toggleFurn`). 10. **Cubas e cooktop**. 11. **Itens na cena** (`items`, `meshes`, `syncMeshes`).
12. **Colisão**. 13. **Desfazer** (`act.update/add/remove`). 14. **Vários móveis e grupos**. 15. **Gizmo, cotas, ponteiro,
Caminhar, atalhos**. 16. **Armazenamento** (`store`, abaixo). 17. **Vistas, lista, editor, Adicionar, celular, orçamento,
sol, Ajustes, desenho final (SSAO), início**.

### Armazenamento (`store`) e a ponte com o servidor

`store` usa `window.claude.use('db')`. No artefato é o banco do claude.ai; no programa é `web/publico/js/ponte.js`,
com a mesma cara: `db.collection('itens').onSnapshot / .doc(id?) → {set, update, delete}` e
`db.doc('config/casa').onSnapshot / .set`, sobre a API (`PUT/PATCH/DELETE /api/projetos/:id/itens/:item`,
`PUT /api/projetos/:id/config`) e o tempo real (`GET /api/projetos/:id/eventos`: eventos `itens`, `item`, `config`,
`planta`, `acesso`). Sem `window.claude` (arquivo aberto direto), grava no localStorage.

- Gravações passam por `store.queue(chave)`, que conta as pendentes em `store.pend`; `store.merge` mantém a versão local
  dos itens com gravação na fila quando chega uma foto do servidor (evita o móvel "pular de volta").
- `db.somenteLeitura` (papel leitor) → `store.readOnly`: aba Adicionar escondida, móveis travados, gravações bloqueadas.
- `window.claude.nuvem` → `NUVEM`: esconde os textos que mandam pedir coisas no chat do claude.ai.
- `use('sample')` → `POST /api/claude/json` (o servidor chama a API da Anthropic); `use('downloads')` → download no navegador.

## Editor de planta (`web/publico/js/editor.js`)

SVG desenhado de novo a cada mudança (o fundo DXF fica num `<g>` com transformação, para não refazer milhares de linhas
ao mover a vista). Trabalha numa cópia `P` da planta; `marcar()` antes de mudar (desfazer), `depois()` depois
(refaz paredes se `paredesPelosComodos`, gera folhas/pisos/muros, redesenha, remonta os painéis). Salva com
`PUT /api/projetos/:id/planta {planta, versao}`: versão diferente da do servidor dá 409 (outra pessoa salvou antes).
Fundo: imagem/PDF (pdf.js legacy, escala do desenho → metros) ou DXF (dxf-parser; linhas em `POST .../referencias/linhas`);
calibração por dois pontos; leitura pelo Claude em `POST /api/projetos/:id/ler-planta` → `Planta.plantaDaLeitura`.

## Ideias que ficaram para depois

Paredes inclinadas e cômodos não retangulares (exige mudar `WALLS` e colisão na página 3D); mais de um pavimento;
leitura de DWG/IFC; reconhecer paredes automaticamente nas linhas do DXF; recuperação de senha por e-mail (hoje é por link
gerado pelo administrador); permissões por item; histórico de mudanças dos móveis.
