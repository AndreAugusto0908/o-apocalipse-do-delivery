const express = require('express');
const { CheckoutService } = require('./services/CheckoutService');
const { CircuitBreaker } = require('./services/CircuitBreaker');
const { Bulkhead, BulkheadCheioError } = require('./services/Bulkhead');

const obterNumeroAmbiente = (nome, valorPadrao) => {
  const valor = Number(process.env[nome]);

  return Number.isFinite(valor) && valor >= 0 ? valor : valorPadrao;
};

const obterLatenciaGatewayMs = () => obterNumeroAmbiente('GATEWAY_LATENCY_MS', 300);

const obterOpcoesCheckoutAmbiente = () => ({
  timeoutMs: obterNumeroAmbiente('CHECKOUT_TIMEOUT_MS', 2000),
  maxRetries: obterNumeroAmbiente('CHECKOUT_MAX_RETRIES', 3),
  retryDelayMs: obterNumeroAmbiente('CHECKOUT_RETRY_DELAY_MS', 500)
});

const criarGatewayPagamentoMock = ({ latencyMs = obterLatenciaGatewayMs() } = {}) => ({
  cobrar: async () => new Promise((resolve) => {
    setTimeout(() => resolve({ status: 'APROVADO' }), latencyMs);
  })
});

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

const criarCheckoutServicePadrao = () => new CheckoutService({
  gatewayPagamento: criarGatewayPagamentoMock(),
  pedidoRepository: criarPedidoRepositoryMock(),
  emailService: criarEmailServiceMock()
}, {
  ...obterOpcoesCheckoutAmbiente(),
  circuitBreaker: criarCircuitBreakerPadrao()
});

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
  status: 'PENDENTE'
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

const registrarRotasCheckout = (app, checkoutService, bulkhead) => {
  app.post('/api/v1/checkout', async (req, res) => {
    if (!pedidoValido(req.body)) {
      return res.status(400).json({ erro: 'Dados incompletos para checkout' });
    }

    const pedido = criarPedidoCheckout(req.body);

    try {
      const resultado = await bulkhead.executar(() => checkoutService.processar(pedido));
      return responderResultadoCheckout(res, resultado);
    } catch (error) {
      if (error instanceof BulkheadCheioError) {
        return respostaCheckoutSobrecarregado(res);
      }
      return respostaCheckoutNaoProcessado(res);
    }
  });
};

const registrarRotasOperacionais = (app) => {
  app.post('/api/v1/cache/flush', (req, res) => {
    console.log('CACHE LIMPO ABRUPTAMENTE!');
    res.json({ status: 'cache_invalidated' });
  });
};

const createApp = ({
  checkoutService = criarCheckoutServicePadrao(),
  bulkhead = criarBulkheadPadrao()
} = {}) => {
  const app = express();
  app.use(express.json());

  registrarRotasCheckout(app, checkoutService, bulkhead);
  registrarRotasOperacionais(app);

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
  obterLatenciaGatewayMs,
  obterOpcoesCheckoutAmbiente,
  obterOpcoesCircuitBreakerAmbiente,
  obterOpcoesBulkheadAmbiente,
  criarGatewayPagamentoMock,
  criarCheckoutServicePadrao,
  criarCircuitBreakerPadrao,
  criarBulkheadPadrao
};




