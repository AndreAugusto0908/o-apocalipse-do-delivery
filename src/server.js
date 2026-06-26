const express = require('express');
const { randomUUID } = require('crypto');
const { CheckoutService } = require('./services/CheckoutService');
const { CircuitBreaker } = require('./services/CircuitBreaker');
const { Bulkhead, BulkheadCheioError } = require('./services/Bulkhead');
const { CacheService, InMemoryCacheStore, RedisCacheStore } = require('./services/CacheService');
const { GatewayPagamentoHttp } = require('./services/GatewayPagamentoHttp');

// Stryker disable all: composition root - leitura de ambiente, selecao de
// adaptadores e doubles em processo (wiring), fora da regra de negocio testada.
// A logica de negocio (validacao, respostas, rotas) abaixo segue mutada.
const obterNumeroAmbiente = (nome, valorPadrao) => {
  const valor = Number(process.env[nome]);

  return Number.isFinite(valor) && valor >= 0 ? valor : valorPadrao;
};

const obterLatenciaGatewayMs = () => obterNumeroAmbiente('GATEWAY_LATENCY_MS', 300);

const obterOpcoesCheckoutAmbiente = () => ({
  timeoutMs: obterNumeroAmbiente('CHECKOUT_TIMEOUT_MS', 2000),
  repoTimeoutMs: obterNumeroAmbiente('CHECKOUT_REPO_TIMEOUT_MS', obterNumeroAmbiente('CHECKOUT_TIMEOUT_MS', 2000)),
  maxRetries: obterNumeroAmbiente('CHECKOUT_MAX_RETRIES', 3),
  retryDelayMs: obterNumeroAmbiente('CHECKOUT_RETRY_DELAY_MS', 500)
});

// Seleciona o gateway por ambiente: HTTP (interceptavel por Toxiproxy) quando
// GATEWAY_URL esta definido; caso contrario, o mock em processo (testes/local).
const criarGatewayPagamentoPadrao = () => {
  const url = process.env.GATEWAY_URL;

  if (url) {
    return new GatewayPagamentoHttp({
      baseUrl: url,
      timeoutMs: obterNumeroAmbiente('GATEWAY_HTTP_TIMEOUT_MS', 3000)
    });
  }

  return criarGatewayPagamentoMock();
};

const criarGatewayPagamentoMock = ({ latencyMs = obterLatenciaGatewayMs() } = {}) => {
  const processadas = new Map();
  const gateway = {
    cobrancasRealizadas: 0,
    cobrar: (valor, cartao, idempotencyKey) => new Promise((resolve) => {
      setTimeout(() => {
        if (idempotencyKey && processadas.has(idempotencyKey)) {
          resolve(processadas.get(idempotencyKey));
          return;
        }

        const resultado = { status: 'APROVADO' };
        if (idempotencyKey) {
          processadas.set(idempotencyKey, resultado);
        }
        gateway.cobrancasRealizadas += 1;
        resolve(resultado);
      }, latencyMs);
    })
  };

  return gateway;
};

const criarPedidoRepositoryMock = () => ({
  salvar: async (pedido) => ({ ...pedido, id: Math.floor(Math.random() * 10000) })
});

const criarEmailServiceMock = () => ({
  enviarConfirmacao: async (email) => console.log(`E-mail enviado para ${email}`)
});

const obterOpcoesCircuitBreakerAmbiente = () => ({
  minimumRequests: obterNumeroAmbiente('CHECKOUT_CB_MIN_REQUESTS', 20),
  threshold: obterNumeroAmbiente('CHECKOUT_CB_THRESHOLD', 0.5),
  resetTimeoutMs: obterNumeroAmbiente('CHECKOUT_CB_RESET_MS', 10000)
});

const criarCircuitBreakerPadrao = () => new CircuitBreaker(obterOpcoesCircuitBreakerAmbiente());

const obterOpcoesBulkheadAmbiente = () => ({
  maxConcurrent: obterNumeroAmbiente('CHECKOUT_BULKHEAD_MAX', 200),
  maxQueue: obterNumeroAmbiente('CHECKOUT_BULKHEAD_QUEUE', 200)
});

const criarBulkheadPadrao = () => new Bulkhead(obterOpcoesBulkheadAmbiente());

const obterLatenciaCatalogoMs = () => obterNumeroAmbiente('CATALOGO_LATENCY_MS', 0);

// Simula a leitura de configuracao/catalogo da loja no banco (fonte lenta).
// E o alvo do Thundering Herd: quando o cache e invalidado, milhares de
// requisicoes tentariam ler daqui ao mesmo tempo.
const carregarCatalogoDoBanco = () => new Promise((resolve) => {
  setTimeout(() => resolve({ loja: 'EntregasJa', aberta: true }), obterLatenciaCatalogoMs());
});

// Seleciona o store do cache por ambiente: Redis (no docker-compose) quando
// REDIS_URL esta definido; caso contrario, in-memory (testes/local).
const criarCacheStorePadrao = () => {
  const url = process.env.REDIS_URL;

  if (!url) {
    return new InMemoryCacheStore();
  }

  // require tardio: o pacote 'redis' so e necessario em homologacao/producao.
  const { createClient } = require('redis');
  const client = createClient({
    url,
    // fail-fast: se o no de cache cair, os comandos rejeitam na hora e o
    // CacheService degrada para a fonte, em vez de pendurar a requisicao.
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 1000,
      reconnectStrategy: (tentativas) => Math.min(tentativas * 100, 2000)
    }
  });
  client.on('error', (erro) => console.error('Redis indisponivel:', erro.message));
  client.connect().catch((erro) => console.error('Falha ao conectar no Redis:', erro.message));

  return new RedisCacheStore({ client });
};

const criarCacheServicePadrao = () => new CacheService({
  store: criarCacheStorePadrao(),
  ttlMs: obterNumeroAmbiente('CATALOGO_CACHE_TTL_MS', 30000)
});

const criarCheckoutServicePadrao = () => new CheckoutService({
  gatewayPagamento: criarGatewayPagamentoPadrao(),
  pedidoRepository: criarPedidoRepositoryMock(),
  emailService: criarEmailServiceMock()
}, {
  ...obterOpcoesCheckoutAmbiente(),
  circuitBreaker: criarCircuitBreakerPadrao()
});

// Stryker restore all
const cartaoValido = (cartao) => (
  cartao
  && typeof cartao === 'object'
  && Boolean(cartao.numero)
  && Boolean(cartao.validade)
  && Boolean(cartao.cvv)
);

const pedidoValido = ({ clienteEmail, valor, cartao }) => (
  typeof clienteEmail === 'string'
  && clienteEmail.includes('@')
  && Number.isFinite(valor)
  && valor > 0
  && cartaoValido(cartao)
);

const criarPedidoCheckout = ({ clienteEmail, valor, cartao }) => ({
  clienteEmail,
  valor,
  cartao,
  status: 'PENDENTE',
  idempotencyKey: randomUUID()
});

const checkoutProcessado = (resultado) => resultado?.status === 'PROCESSADO';

const respostaCheckoutProcessado = (res, pedido) => res.status(200).json({
  mensagem: 'Pedido finalizado com sucesso!',
  pedido
});

const respostaCheckoutNaoProcessado = (res) => res.status(500).json({
  erro: 'Nao foi possivel processar seu pagamento. Tente mais tarde.'
});

const respostaCheckoutSobrecarregado = (res) => res.status(503).json({
  erro: 'Sistema sobrecarregado. Tente novamente em instantes.'
});

const responderResultadoCheckout = (res, resultado) => {
  if (checkoutProcessado(resultado)) {
    return respostaCheckoutProcessado(res, resultado);
  }

  return respostaCheckoutNaoProcessado(res);
};

const registrarRotasCheckout = (app, { checkoutService, bulkhead, cacheService, carregarCatalogo }) => {
  app.post('/api/v1/checkout', async (req, res) => {
    if (!pedidoValido(req.body)) {
      return res.status(400).json({ erro: 'Dados incompletos para checkout' });
    }

    const pedido = criarPedidoCheckout(req.body);

    try {
      const resultado = await bulkhead.executar(async () => {
        // Read-through: consulta o catalogo via cache (single-flight + fallback).
        // Sob Thundering Herd, isto protege o banco da manada.
        await cacheService.obter('catalogo:loja', carregarCatalogo);
        return checkoutService.processar(pedido);
      });
      return responderResultadoCheckout(res, resultado);
    } catch (error) {
      if (error instanceof BulkheadCheioError) {
        return respostaCheckoutSobrecarregado(res);
      }
      return respostaCheckoutNaoProcessado(res);
    }
  });
};

const registrarRotasOperacionais = (app, cacheService) => {
  app.post('/api/v1/cache/flush', async (req, res) => {
    console.log('CACHE LIMPO ABRUPTAMENTE!');
    await cacheService.flush();
    res.json({ status: 'cache_invalidated' });
  });
};

const createApp = ({
  checkoutService = criarCheckoutServicePadrao(),
  bulkhead = criarBulkheadPadrao(),
  cacheService = criarCacheServicePadrao(),
  carregarCatalogo = carregarCatalogoDoBanco
} = {}) => {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  registrarRotasCheckout(app, { checkoutService, bulkhead, cacheService, carregarCatalogo });
  registrarRotasOperacionais(app, cacheService);

  return app;
};

const startServer = (port = 3000) => {
  const app = createApp();
  return app.listen(port, () => {
    console.log(`Servidor da EntregasJa rodando na porta ${port}`);
  });
};

// Stryker disable next-line all: bootstrap manual da aplicacao, fora da regra de negocio testada
if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer,
  pedidoValido,
  cartaoValido,
  checkoutProcessado,
  criarPedidoCheckout,
  obterLatenciaGatewayMs,
  obterOpcoesCheckoutAmbiente,
  obterOpcoesCircuitBreakerAmbiente,
  obterOpcoesBulkheadAmbiente,
  criarGatewayPagamentoMock,
  criarCheckoutServicePadrao,
  criarCircuitBreakerPadrao,
  criarBulkheadPadrao,
  criarCacheServicePadrao,
  carregarCatalogoDoBanco
};




