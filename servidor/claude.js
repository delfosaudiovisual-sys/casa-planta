// Chamadas ao Claude pela API da Anthropic. A chave (ANTHROPIC_API_KEY) fica só no servidor; sem ela as funções somem das páginas.
//  - responderJson: medidas e preços dos móveis (a página 3D monta o pedido; aqui só repassamos e lemos o JSON da resposta)
//  - lerPlanta: lê a imagem de uma planta baixa e devolve cômodos e aberturas num formato simples (compartilhado/planta.js converte)
const Anthropic = require('@anthropic-ai/sdk');
const { erro } = require('./util');

// Se o Claude recusar um pedido por segurança, a API tenta de novo noutro modelo indicado pela Anthropic (fallbacks: 'default').
const BETAS = ['server-side-fallback-2026-07-01'];

function criarClaude(cfg, log) {
  if (!cfg.anthropicKey) return null;
  const cliente = new Anthropic({ apiKey: cfg.anthropicKey, timeout: 180_000, maxRetries: 2 });

  function traduzirErro(e) {
    if (e && e.statusCode) return e;
    if (e instanceof Anthropic.APIUserAbortError) return erro(499, 'Pedido cancelado.', 'cancelled');
    if (e instanceof Anthropic.RateLimitError) return erro(429, 'Muitos pedidos ao Claude agora. Tente de novo em alguns minutos.', 'rate_limited');
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      log.error('Chave da API da Anthropic recusada: confira ANTHROPIC_API_KEY');
      return erro(503, 'O Claude não está disponível neste servidor.', 'sampling_disabled');
    }
    if (e instanceof Anthropic.BadRequestError) { log.warn({ msg: e.message }, 'pedido recusado pela API'); return erro(502, 'O Claude não aceitou esse pedido.', 'refused'); }
    if (e instanceof Anthropic.APIConnectionTimeoutError) return erro(504, 'O Claude demorou demais para responder. Tente de novo.', 'timeout');
    if (e instanceof Anthropic.APIError) { log.warn({ status: e.status, msg: e.message }, 'erro da API da Anthropic'); return erro(502, 'Não consegui falar com o Claude agora. Tente de novo.', 'api'); }

    log.error(e, 'erro inesperado no Claude');
    return erro(502, 'Não consegui falar com o Claude agora. Tente de novo.', 'api');
  }

  function textoDa(resposta) {
    if (resposta.stop_reason === 'refusal') throw erro(422, 'O Claude não respondeu a esse pedido.', 'refused');
    return resposta.content.filter(b => b.type === 'text').map(b => b.text).join('');
  }

  // primeiro objeto JSON do texto (a resposta às vezes vem entre ``` ou com uma frase antes)
  function extrairJson(t) {
    const limpo = t.replace(/```(?:json)?/gi, '').trim();
    try { return JSON.parse(limpo); } catch { /* procura o objeto */ }
    const i = limpo.indexOf('{'), j = limpo.lastIndexOf('}');
    if (i >= 0 && j > i) { try { return JSON.parse(limpo.slice(i, j + 1)); } catch { /* inválido */ } }
    throw erro(502, 'A resposta veio num formato inesperado. Tente de novo.', 'invalid_json');
  }

  async function responderJson(prompt, { signal } = {}) {
    try {
      const r = await cliente.beta.messages.create({
        model: cfg.claudeModelo,
        max_tokens: 16000,
        betas: BETAS,
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: 'Você ajuda a planejar a mobília e o orçamento de uma casa no Brasil. Responda somente com o objeto JSON pedido, sem texto antes ou depois.',
        messages: [{ role: 'user', content: prompt }],
      }, { signal });
      return extrairJson(textoDa(r));
    } catch (e) { throw traduzirErro(e); }
  }

  async function lerPlanta({ imagem, tipo, observacao, lote }, { signal } = {}) {
    const pedido = `Esta é a planta baixa de uma casa. Quero montar um modelo 3D dela. Leia as cotas (medidas escritas na planta) e devolva os cômodos e as aberturas.

Coordenadas, em metros:
- Origem no canto da frente-esquerda do terreno. x cresce da esquerda para a direita, olhando a casa da rua; y cresce da rua para o fundo.
- Se a planta não mostrar a rua, considere que a frente é a parte de baixo da imagem.
- Cada cômodo é um retângulo com as MEDIDAS INTERNAS (sem as paredes): x e y são o canto da frente-esquerda do cômodo; largura vai em x, profundidade em y.
- Entre dois cômodos vizinhos existe uma parede: deixe entre eles um espaço igual à espessura das paredes (normalmente 0,15 m). Os cômodos não podem se sobrepor.
- Cômodos internos (quartos, sala, cozinha, banheiro, corredor, lavanderia fechada) têm interno=true. Áreas externas (garagem, varanda aberta, quintal, jardim, área de serviço aberta) têm interno=false.
- azulejo=true em banheiros, cozinhas e lavanderias.
- Cômodos com formato de L: divida em dois retângulos com o mesmo nome.

Aberturas (portas e janelas): cada uma fica num lado de um cômodo (frente = lado da rua, fundo, esquerda, direita).
- comodo = índice do cômodo na lista (começa em 0); distancia = do canto da frente (para os lados esquerda e direita) ou do canto esquerdo (para frente e fundo) do cômodo até o início da abertura.
- Uma porta entre dois cômodos aparece uma vez só. Janela: peitoril (altura do chão até a janela) e altura da janela. Porta: altura da porta (normalmente 2,10).
- tipo: porta, janela, porta_vidro (porta de vidro de correr ou de abrir), basculante (janela pequena e alta, de banheiro).

Se uma medida não estiver escrita, estime pela escala do desenho e pelas medidas que estão escritas. Em observacoes, diga em uma ou duas frases o que ficou incerto.${lote ? `\nO terreno tem ${lote.largura} m de largura por ${lote.profundidade} m de profundidade.` : ''}${observacao ? `\nObservação de quem enviou: ${observacao}` : ''}`;
    const numero = { type: 'number' };
    const esquema = {
      type: 'object', additionalProperties: false,
      required: ['lote', 'espessura', 'comodos', 'aberturas', 'observacoes'],
      properties: {
        lote: { type: 'object', additionalProperties: false, required: ['largura', 'profundidade'], properties: { largura: numero, profundidade: numero } },
        espessura: numero,
        comodos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['nome', 'x', 'y', 'largura', 'profundidade', 'interno', 'azulejo'],
          properties: { nome: { type: 'string' }, x: numero, y: numero, largura: numero, profundidade: numero, interno: { type: 'boolean' }, azulejo: { type: 'boolean' } } } },
        aberturas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tipo', 'comodo', 'lado', 'distancia', 'largura', 'peitoril', 'altura'],
          properties: { tipo: { type: 'string', enum: ['porta', 'janela', 'porta_vidro', 'basculante'] }, comodo: { type: 'integer' },
            lado: { type: 'string', enum: ['frente', 'fundo', 'esquerda', 'direita'] }, distancia: numero, largura: numero, peitoril: numero, altura: numero } } },
        observacoes: { type: 'string' },
      },
    };
    try {
      const r = await cliente.beta.messages.stream({
        model: cfg.claudeModelo,
        max_tokens: 32000,
        betas: BETAS,
        fallbacks: 'default',
        output_config: { effort: 'high', format: { type: 'json_schema', schema: esquema } },
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: tipo, data: imagem.toString('base64') } },
          { type: 'text', text: pedido },
        ] }],
      }, { signal, timeout: 600_000 }).finalMessage();
      return extrairJson(textoDa(r));
    } catch (e) { throw traduzirErro(e); }
  }

  return { responderJson, lerPlanta, modelo: cfg.claudeModelo };
}

module.exports = { criarClaude };
