# Segurança

## O que o programa faz

- **Só entra quem foi convidado.** Não existe cadastro aberto. O link do convite (e o de nova senha) vale 7 dias,
  uma vez só, e o código fica depois do `#` no endereço, que o navegador não manda para servidores nem registros.
- **Senhas** guardadas com scrypt (embaralhamento lento, feito para resistir a tentativas). Pelo menos 10 caracteres
  e fora da lista das senhas mais óbvias.
- **Tentativas de senha**: 10 por IP a cada 15 minutos; 5 erros no mesmo e-mail bloqueiam esse e-mail por 15 minutos.
- **Sessão** num cookie `HttpOnly` (scripts não conseguem ler), `SameSite=Lax` e `Secure` (só HTTPS) com o prefixo
  `__Host-`. Vale 30 dias sem uso. Trocar a senha encerra as sessões dos outros aparelhos; desativar uma pessoa a
  desconecta na hora.
- **Permissões conferidas no servidor** em todo pedido: quem não tem acesso a um projeto recebe "não encontrado"
  (nem fica sabendo que ele existe); quem só vê não consegue alterar nada, mesmo chamando a API direto.
- **Proteção contra pedidos forjados (CSRF)**: além do cookie `SameSite`, pedidos que mudam algo só valem se vierem
  das páginas do próprio site (cabeçalhos `Origin` e `Sec-Fetch-Site`).
- **Política de conteúdo (CSP)**: as páginas só rodam scripts do próprio site; three.js, fontes e leitores de PDF
  e DXF são servidos localmente, sem CDN. Nada digitado por alguém vira código na página dos outros
  (as telas montam o texto sem `innerHTML`; links de produtos precisam começar com `http(s)://`).
- **Dados conferidos na entrada**: tamanhos máximos, campos com nomes simples, planta validada (números,
  limites e aberturas dentro das paredes); arquivos de fundo precisam ser imagens de verdade (o conteúdo é conferido,
  não só o nome).
- **Claude**: a chave da API fica só no servidor; há limite de pedidos por pessoa e por dia.
- **Registro** das ações importantes (entradas, convites, compartilhamentos, exclusões) na página de projetos,
  para o administrador.
- **Cópias de segurança** diárias do banco (últimas 14) e as 40 últimas versões da planta de cada projeto.
- O servidor roda sem privilégios de administrador dentro do contêiner.

## O que fica com você

- Ative a **verificação em duas etapas** no GitHub e no Render (quem entra nessas contas controla o programa).
- Guarde a chave da Anthropic só no painel da hospedagem. Se ela vazar, apague e crie outra no console da Anthropic.
- Depois do primeiro acesso, apague `ADMIN_SENHA_INICIAL` das variáveis da hospedagem.
- Desative quem não precisa mais de acesso (**Desativar**, na página de projetos).
- Baixe uma cópia do banco de vez em quando e guarde fora do servidor.
- Mantenha o repositório no GitHub **privado** (ele tem os dados iniciais da Casa 975).
