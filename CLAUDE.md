# Casa 975 — guia para o Claude Code

Modelo 3D de uma casa térrea geminada (lote 5,00 × 25,00 m, pé-direito 2,76 m) para planejar móveis,
reformas e orçamento. Até aqui ele viveu como **artefato do claude.ai**: uma página HTML única com
three.js r147 e um banco de dados do próprio artefato. O objetivo agora é transformá-lo num
**programa** (de preferência desktop, funcionando offline), sem perder nada do que a página já faz.

- Artefato publicado: https://claude.ai/code/artifact/6090c9a3-e226-4d77-a3aa-aba852fae084 (versão 19).
  Se a ferramenta `Artifact` existir nesta sessão, dá para ler e republicar por esse link.
  O banco (coleção `itens`) também é lido e escrito pela ferramenta `ArtifactData`.
- `src/casa-975-3d.html` é **exatamente** o que está publicado (versão 19). É a fonte da verdade.
- Interface e textos em **português do Brasil**, tom direto e simples. O dono é leigo em programação.
- A página **não traz endereço, bairro nem cidade**. Manter assim: ela pode ser compartilhada.

## Estrutura do repositório

```
src/casa-975-3d.html        página inteira (HTML + CSS + JS), no formato do artefato: sem <html>/<head>/<body>
dados/itens.json            exportação do banco do artefato em 01/10/2026 (28 itens, com id)
dados/config-casa.json      configuração (no banco não havia doc config/casa: são os valores padrão)
ferramentas/montar.js       gera dist/index.html completo (--offline copia o three.js para dist/vendor)
ferramentas/foto.js         abre a página num Chromium sem tela, roda uma cena e tira fotos
ferramentas/cenas/basico.js exemplo de cena (3D, planta, cozinha caminhando)
ferramentas/verificar-sintaxe.js  compila cada <script> com new Function para pegar erro de sintaxe
```

## Comandos

```bash
npm install                       # three@0.147.0 (para o modo offline) e playwright (para as fotos)
npx playwright install chromium   # só se o Chromium do Playwright não estiver instalado
# ou, se já houver um Chromium na máquina (ex.: /opt/pw-browsers/chromium): CHROMIUM_PATH=/caminho/do/chrome npm run foto
npm run verificar                 # sintaxe dos <script> de src/casa-975-3d.html
npm run montar                    # dist/index.html (three.js pelo CDN)
npm run montar:offline            # dist/index.html + dist/vendor/three (sem internet)
npm run foto                      # fotos em ferramentas/fotos/ (cena básica, 1400×860)
node ferramentas/foto.js ferramentas/cenas/basico.js 390 844   # mesmo teste em tamanho de celular
```

Depois de **qualquer** edição em `src/casa-975-3d.html`: `npm run verificar` e uma foto da área mexida.
Olhe as fotos com a ferramenta de leitura de imagem antes de dar o trabalho por pronto.

## Coisas que pegam

- O arquivo tem ~680 KB e algumas linhas enormes (texturas em base64 em `PHOTO_TEX`, por volta da linha 495).
  Leia por trechos (offset/limit) e prefira editar com substituições exatas de trechos únicos.
- No teste, o WebGL roda em software (SwiftShader): cada quadro leva centenas de ms e o `dt` do laço é limitado.
  Animações (portas, gavetas, andar) se testam chamando as funções direto: `stepDoors(1)`, `stepFurn(1)`, `walkStep(...)`.
- `foto.js` injeta `window.__casa` trocando a linha `const clock = new THREE.Clock();`. Se renomear algo da
  lista `EXPOE`, atualize a lista também; um nome inexistente quebra a página no teste.
- O evento "Failed to load resource" no teste é esperado: as fontes do Google ficam bloqueadas.
- O primeiro clique logo depois de trocar de vista às vezes some no Chromium sem tela; espere um pouco antes de clicar.

## Coordenadas

- Planta: `x` de 0 a 5 (oeste → leste; olhando da rua, esquerda → direita) e `y` de 0 a 25 (rua → fundo). Metros.
- Mundo 3D: `X = x`, `Z = -y`, `Y` = altura. O piso interno está em `FLOOR = 0.02`.
- Móvel: `x`, `y` = centro; `rot` em graus; `group.rotation.y = -rot·π/180`.
  Frente do móvel = +Z local. `toPlan(it, lx, lz)` e `toLocal(it, X, Y)` convertem entre o local do móvel e a planta.
  Com `rot = 0` a frente aponta para a rua; com 90, para o oeste.

## Mapa do código (seções marcadas com `// ------------------------------------------------------------------`)

Na ordem em que aparecem no `<script>` principal:

1. **Geometria da casa**: `H`, `LW`, `LD`, `WALLS` (`[x0,y0,x1,y1, aberturas]`, cada abertura `[a,b,base,topo,tipo]` com
   tipo `win | basc | door | glass`), `DOORS` (folhas de madeira: dobradiça, largura, ângulo aberto e fechado), `ROOMS`, `MUROS`, `PILLAR`.
2. **Renderizador, câmeras, luzes, céu**: `persp`/`ctrlP` (OrbitControls), `ortho`/`ctrlO` (planta), `fpCam` (caminhar), `Sky`, `RoomEnvironment`.
3. **Texturas e materiais**: `TX` (geradas em canvas), `MAT` (casa), `fmat()` (cache de materiais dos móveis), `UNIT` (escala das texturas).
4. **Casa**: `MeshBuilder` (junta faces por material), `addPB` (caixa em coordenadas de planta), `buildShellInto` (paredes, vãos, esquadrias),
   `SOLIDS`/`WALL_SOLIDS`/`OBST` (retângulos para colisão), telhado, forros, lote e vizinhança (`context`).
5. **Portas da casa**: `DOOR_T`, `registerDoor`, `toggleDoor`, `stepDoors` (estado salvo em `localStorage` `casa975-portas`).
6. **Portas e janelas editáveis**: `OPENINGS` (ids `w{parede}o{abertura}`), `applyOpenings(config.aberturas)` reconstrói vãos,
   folhas e colisão. A interface fica em Ajustes › Portas e janelas (`renderOpening`, `editOpening`, `hitOpening`).
7. **Modelos dos móveis**: `TIPOS`, `TIPO_RULES`/`guessTipo` (tipo pelo nome), `PRESETS` e `PRESETS_OBRA` (modelos prontos),
   `MODELS` (um gerador por tipo: `(w,d,h,cor,it) => THREE.Group`, base em y = 0, frente em +Z), `VARIANTS` (campo `modelo`).
   Inclui construção e quintal: `parede`, `muro`, `cerca`, `portao`, `canteiro`, `horta`, `casinha`, `piso`, `cobertura`.
8. **Formatos (L, U, fechado, chaise)**: `SHAPES`, `shapeDims`, `runsOf` (trechos retos, cada um com sua frente),
   `partsOf` (retângulos para colisão, caminho e mapa), `shapeGeo` (contorno), `buildShaped`. Balcão e bancada em L/U têm tampo
   de peça única com os furos das cubas e frontão contínuo; as portas só ocupam a parte visível de cada trecho (`_span`).
9. **Portas e gavetas dos móveis**: dentro de um modelo, `toLeaf`/`hingeLeaf` movem peças para um grupo articulado
   (`hinge`, `drawer`, `flap`, `lid`, `slide`); `carcass` e `drawerBox` fazem caixas ocas. `mergeGroup` junta o resto por material e
   devolve `userData.leaves`. Estado em `furnT`; `toggleFurn`, `stepFurn`, `applyLeaves`. Abre com duplo clique, botão ou Enter.
10. **Cubas e cooktop**: `holesFor` (furo no tampo), `counterUnder`, `settle` (assenta na altura do tampo).
11. **Itens na cena**: `items` (array), `meshes` (id → {group, model, outline, label}), `upsertMesh`, `syncMeshes`.
12. **Colisão**: `sat` (eixo separador), `resolveItem`, `sweepItem`, `hitsWall`, `overlapsOf` (aviso de sobreposição).
13. **Desfazer**: `pushUndo`, `applyOp` com operações `upd | add | del | open | batch`; `act.update/add/remove` já registram o desfazer.
14. **Vários móveis**: `multi` (Set), `select(id, {add, single})`, campo `grupo`, `resolveGroup`, `sweepGroup`, `turnGroup`,
    `commitGroup`, `mergeLPlan`/`mergeToL` ("Juntar em L"), `renderGroupEditor`; gizmo do grupo usa o `pivot`.
15. **Gizmo** (TransformControls), **cotas** até as paredes, **ponteiro** (selecionar, arrastar, régua `measure`),
    **modo Caminhar** (colisão, `navGrid` com A*, mini-mapa), **atalhos**, **setas da tela** (`padItemMode`: com móvel selecionado, mexem nele).
16. **Armazenamento** (`store`): ver abaixo.
17. **Vistas** (`setView('3d' | 'top' | 'front' | 'back' | 'walk')`), lista e editor (`renderList`, `renderEditor`), Adicionar,
    celular (painel que sobe, `itemBar`), orçamento (`renderBudget`, `estimatePrices`), sol (`applySun`), Ajustes, desenho final (SSAO), início.

## Armazenamento: o ponto que muda para virar programa

`store` tem dois modos:

- **`db`**: `window.claude.use('db')` (só existe dentro do artefato). Coleção `itens` com `onSnapshot`,
  doc `config/casa` com `onSnapshot`. Escritas: `ref.set`, `doc.update`, `doc.delete`, `cfg.set`.
- **`local`**: sem `window.claude`. Itens em `localStorage['casa975-itens']`, configuração em `localStorage['casa975-config']`.

Interface usada pelo resto do código: `store.init()`, `store.add(data, id?) → id`, `store.update(id, patch)`,
`store.remove(id)`, `store.setConfig(patch)`, `store.mode`. Depois de mudar dados, o `store` chama `refresh()` e, na configuração,
`applyConfig()`. **Troque só o miolo do `store`** (por exemplo, arquivo JSON via Electron/IPC, ou IndexedDB) e mantenha essa interface.

Partes da API do banco do artefato que o `store` usa (útil para escrever um substituto com a mesma cara):
`db.collection('itens')` → `.onSnapshot(snap => snap.docs[i].id / .data(), onErro)`, `.doc()` (id novo) e `.doc(id)` →
`{id, set(data), update(patch), delete()}`; `db.doc('config/casa')` → `.onSnapshot(s => s.exists / s.data())`, `.set(data)`.
Atualizar um campo para `null` é usado para "apagar" valores (ex.: `grupo: null`).

Outras chaves locais (por navegador, não precisam migrar): `casa975-prefs` (preferências de visualização),
`casa975-portas` (portas da casa abertas ou fechadas), `casa975-seed-pia` (semente antiga).

## Modelo de dados

Item (`itens`):

| campo | significado |
|---|---|
| `id` | id do documento |
| `nome`, `tipo` | nome livre; tipo de `TIPOS` (sem tipo válido, `guessTipo(nome)`). `tipo: 'gasto'` = gasto sem 3D (só orçamento) |
| `modelo` | variante do tipo (`VARIANTS`), ex.: cuba `inox`, cerca `tela`, parede `porta` |
| `x`, `y`, `rot`, `elev` | centro na planta (m), giro (graus), altura do chão até a base (m) |
| `w`, `d`, `h` | largura (frente), profundidade, altura (m). Em L/U/fechado são as medidas totais |
| `forma`, `lado`, `prof`, `prof2` | formato (`reta`, `L`, `U`, `fechado`, `chaise`), lado do braço (`esq`/`dir`), profundidade do lado principal e do braço (m) |
| `cor` | cor principal `#rrggbb` |
| `status` | `planejado` (vou comprar), `comprado`, `tenho` |
| `preco` | preço real (R$) ou `null` |
| `est`, `estMin`, `estMax`, `estFonte`, `estData` | estimativa de preço quando não há preço |
| `link`, `fonte`, `conferir` | link da loja, de onde vieram as medidas, link ainda a conferir |
| `grupo` | id do grupo (um clique seleciona o grupo todo) |
| `oculto` | escondido no 3D |
| `criado` | data ISO |

Configuração (`config/casa`): `sunSide` (lado do nascer do sol, graus), `sunFine` (ajuste fino), `lat` (latitude),
`limite` (orçamento máximo, R$), `aberturas` (`{ "w2o1": {a, b, base, top} }`, só as portas e janelas alteradas).

## Recursos que dependem do claude.ai

- `window.claude.use('sample')`: "Medidas e preço com o Claude" (`qGo`) e "Estimar preços que faltam" (`estimatePrices`),
  via `sample.json(prompt, {signal, onText})`. Sem ele, `claudeUnavailable()` esconde o cartão e mostra um aviso.
  No programa: ou usar a API da Anthropic com uma chave que o usuário informa (guardada localmente, nunca no código), ou manter escondido.
- `window.claude.use('downloads')`: `dl.save({filename, data})` para salvar a imagem da vista e a planilha CSV do orçamento.
  Sem ele os dois botões somem. No programa: trocar por salvar arquivo (Electron `dialog` + `fs`, ou link de download no navegador).

## Plano sugerido para virar programa

1. **Escolher o formato** com o usuário: Electron (o HTML roda praticamente igual; gera .exe), Tauri (instalador menor) ou PWA
   (instala pelo navegador, também no celular). Para Windows, o caminho mais curto é Electron.
2. **Offline**: usar `npm run montar:offline` como base (three.js local). As fontes IBM Plex vêm do Google Fonts: baixar e servir localmente,
   ou aceitar a fonte do sistema.
3. **Armazenamento**: novo modo do `store` gravando num arquivo JSON na pasta de dados do usuário, com a mesma interface.
   No primeiro uso, importar `dados/itens.json` e `dados/config-casa.json`. Adicionar "Exportar/Importar backup".
4. **Downloads**: imagem da vista e CSV com diálogo de salvar.
5. **Claude**: decidir com o usuário entre chave da API ou desligar.
6. **Empacotar**: gerar o instalador. A partir de Linux, alguns alvos de Windows (como o instalador NSIS) podem exigir Wine;
   alternativa: GitHub Actions com runner Windows.
7. **Testar** com `ferramentas/foto.js` (desktop e celular) e, no Electron, abrir de verdade antes de entregar.

Se o usuário quiser continuar usando o artefato também, mantenha `src/casa-975-3d.html` funcionando no formato do artefato
(o modo `db` continua lá) e coloque as diferenças do programa num invólucro (ex.: `preload.js` do Electron que expõe um
`window.claude` falso com `use('db')`/`use('downloads')` implementados em arquivo local). Assim o mesmo arquivo serve aos dois.

## Histórico (o que já existe)

Casa fiel às fotos e à planta (paredes, vãos, esquadrias, portas de madeira que abrem, porta de vidro de correr, box, telhado,
forros, lote, casas vizinhas); vistas 3D, planta, frente, fundo e caminhar (colisão, clique para ir, mini-mapa, joystick no celular);
sol real por data, hora e latitude; móveis com modelos próprios por tipo; L/U/chaise/canto; portas e gavetas dos móveis que abrem;
cubas que recortam o tampo; seleção múltipla, grupos e "Juntar em L"; desfazer/refazer; régua; cotas até as paredes;
portas e janelas da casa editáveis; paredes, muros, cercas, portões, canil, horta, canteiro, piso e cobertura para planejar reformas;
orçamento com preço real ou estimado, limite e CSV; interface pensada também para celular.
