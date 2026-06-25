const express = require('express');
const { CheckoutService } = require('./services/CheckoutService');

const criarGatewayPagamentoMock = () => ({
  cobrar: async () => new Promise((resolve) => {
    setTimeout(() => resolve({ status: 'APROVADO' }), 300);
  })
});

const criarPedidoRepositoryMock = () => ({
  salvar: async (pedido) => ({ ...pedido, id: Math.floor(Math.random() * 10000) })
});

const criarEmailServiceMock = () => ({
  enviarConfirmacao: async (email) => console.log(`E-mail enviado para ${email}`)
});

const criarCheckoutServicePadrao = () => new CheckoutService({
  gatewayPagamento: criarGatewayPagamentoMock(),
  pedidoRepository: criarPedidoRepositoryMock(),
  emailService: criarEmailServiceMock()
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

const responderResultadoCheckout = (res, resultado) => {
  if (checkoutProcessado(resultado)) {
    return respostaCheckoutProcessado(res, resultado);
  }

  return respostaCheckoutNaoProcessado(res);
};

const registrarRotasCheckout = (app, checkoutService) => {
  app.post('/api/v1/checkout', async (req, res) => {
    if (!pedidoValido(req.body)) {
      return res.status(400).json({ erro: 'Dados incompletos para checkout' });
    }

    const pedido = criarPedidoCheckout(req.body);
    const resultado = await checkoutService.processar(pedido);

    return responderResultadoCheckout(res, resultado);
  });
};

const registrarRotasOperacionais = (app) => {
  app.post('/api/v1/cache/flush', (req, res) => {
    console.log('CACHE LIMPO ABRUPTAMENTE!');
    res.json({ status: 'cache_invalidated' });
  });
};

const createApp = ({ checkoutService = criarCheckoutServicePadrao() } = {}) => {
  const app = express();
  app.use(express.json());

  registrarRotasCheckout(app, checkoutService);
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
  cartaoValido
};


