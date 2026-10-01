# Colocar o programa no ar

O programa é um site: fica num servidor na internet e cada pessoa entra pelo navegador (computador ou celular)
com o próprio e-mail e senha. Os dados ficam num banco no disco do servidor, com cópia de segurança diária.

Há três caminhos. O **Render** é o mais simples e o recomendado: você conecta o GitHub, preenche três campos e ele
cuida de HTTPS, atualizações e reinícios.

| | Render (recomendado) | Railway | Servidor próprio (VPS) |
|---|---|---|---|
| Dificuldade | só cliques | só cliques | terminal e domínio próprio |
| Custo aproximado | US$ 7/mês + US$ 0,25/GB de disco | a partir de US$ 5/mês | a partir de US$ 5/mês |
| Atualização | automática, depois que os testes passam | automática | `git pull` + `docker compose up -d --build` |
| HTTPS | automático | automático | automático (Caddy) |

> O plano grátis do Render não serve: ele não tem disco permanente e apagaria os dados a cada atualização.

## Render, passo a passo

1. **Conta**: entre em <https://render.com> com a sua conta do GitHub (botão "GitHub").
2. **Acesso ao repositório**: quando o Render pedir, autorize o acesso ao repositório `casa-planta`.
3. **Criar pelo arquivo do projeto**: no painel, clique em **New → Blueprint**, escolha o repositório
   `casa-planta` e o branch principal (`main`). O Render lê o arquivo `render.yaml` e mostra o serviço
   `casa-planta` com um disco de 1 GB.
4. **Preencher as variáveis** que ele pedir:
   - `ADMIN_EMAIL`: o seu e-mail (você vai ser o administrador).
   - `ADMIN_SENHA_INICIAL`: uma senha com pelo menos 10 caracteres, só para o primeiro acesso.
   - `ADMIN_NOME`: o seu nome.
   - `ANTHROPIC_API_KEY`: opcional (veja "Claude" abaixo). Pode deixar em branco e colocar depois.
5. Clique em **Apply** / **Deploy**. A primeira montagem leva uns 5 minutos.
6. Quando aparecer **Live**, abra o endereço que o Render mostra (algo como `https://casa-planta-xxxx.onrender.com`).
7. Entre com o e-mail e a senha do passo 4. O projeto **Casa 975** já estará lá, com os 28 itens.
8. Em **Minha conta**, troque a senha. Depois, no Render, em **Environment**, apague `ADMIN_SENHA_INICIAL`
   (ela só é usada quando o banco está vazio; apagar evita que fique guardada).

### Convidar outras pessoas

Na página de projetos, em **Pessoas com acesso ao sistema → Convidar pessoa**: informe o e-mail e copie o link.
Mande o link pelo WhatsApp ou e-mail; a pessoa abre, cria a senha e entra. O link vale 7 dias e uma vez só.
Depois, em cada projeto, **Compartilhar** escolhe quem vê e quem edita:

- **só vê**: abre a casa em 3D, a planta e o orçamento, sem mudar nada;
- **pode editar**: muda móveis, planta, preços e ajustes;
- **dono**: também compartilha com outras pessoas e pode apagar o projeto.

Esqueceu a senha? O administrador clica em **Link de nova senha** ao lado da pessoa e manda o link.

### Domínio próprio (opcional)

No Render, em **Settings → Custom Domains**, adicione o domínio (ex.: `casa.seusite.com.br`) e crie no seu
provedor de domínio o registro que ele indicar. O certificado HTTPS é automático. Depois, em **Environment**,
crie `URL_PUBLICA` com o endereço novo (`https://casa.seusite.com.br`), para os links de convite usarem ele.

### Claude (opcional)

Com a chave da API da Anthropic, ligam três funções: **medidas e preço** de um produto pelo nome ou link,
**estimar preços** que faltam no orçamento e **ler a planta** (o Claude olha a imagem da planta e monta um
rascunho com cômodos, portas e janelas).

1. Crie a chave em <https://console.anthropic.com> (**API Keys → Create Key**) e coloque créditos na conta.
2. No Render, em **Environment**, crie `ANTHROPIC_API_KEY` com a chave. O serviço reinicia sozinho.

A chave fica só no servidor; o navegador nunca a vê. Para não ter surpresas na conta, há limites:
30 pedidos por pessoa por hora e 300 por dia no total (mude com `CLAUDE_LIMITE_HORA` e `CLAUDE_LIMITE_DIA`).
Cada pedido custa centavos; a leitura de planta é a mais cara (alguns centavos de dólar por imagem).

### Cópias de segurança

- O servidor guarda uma cópia do banco por dia no próprio disco (as últimas 14).
- O Render tira fotos do disco todo dia (**Disks → Snapshots**) e permite voltar a uma delas.
- Como administrador, **Baixar cópia do banco** na página de projetos baixa o banco inteiro (um arquivo `.db`).
  Guarde uma de vez em quando no seu computador ou no Google Drive.
- Cada projeto tem **Mais… → Baixar cópia (.json)**, que dá para abrir de novo em **Novo projeto → Abrir uma cópia baixada**.

Para voltar um banco baixado: pare o serviço, troque o arquivo `/dados/casa.db` pelo baixado (Render: **Shell**) e
ligue de novo. Se precisar, peça ajuda numa sessão do Claude Code.

## Railway

1. Entre em <https://railway.com> com o GitHub e clique em **New Project → Deploy from GitHub repo → casa-planta**.
2. Ele encontra o `Dockerfile` sozinho. Em **Variables**, crie `ADMIN_EMAIL`, `ADMIN_SENHA_INICIAL`, `ADMIN_NOME`,
   `NODE_ENV=production` e, se quiser, `ANTHROPIC_API_KEY`.
3. Clique com o botão direito no serviço → **Attach Volume** com o caminho `/dados`.
4. Em **Settings → Networking**, clique em **Generate Domain**. Crie a variável `URL_PUBLICA` com esse endereço (com `https://`).
5. Em **Settings**, ligue **Wait for CI** para só atualizar depois que os testes do GitHub passarem.

## Servidor próprio (VPS)

Precisa de um servidor Linux com Docker e de um domínio apontando para o IP dele.

```bash
git clone https://github.com/delfosaudiovisual-sys/casa-planta.git
cd casa-planta
cp .env.exemplo .env      # preencha ADMIN_EMAIL, ADMIN_SENHA_INICIAL, DOMINIO e, se quiser, ANTHROPIC_API_KEY
docker compose up -d --build
```

O Caddy pede o certificado HTTPS sozinho. Para atualizar: `git pull && docker compose up -d --build`.
Os dados ficam no volume `dados` do Docker; a cópia diária fica em `/dados/copias` dentro dele.

## Testar no seu computador (sem internet pública)

Precisa do Node.js 22 ou mais novo.

```bash
npm install
npm run montar
ADMIN_EMAIL=voce@exemplo.com ADMIN_SENHA_INICIAL=uma-senha-boa-123 npm start
```

Abra <http://localhost:3000>. Os dados ficam na pasta `dados-servidor/` (fora do Git).
