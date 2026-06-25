const request = require('supertest');
const { createApp, startServer, cartaoValido, obterLatenciaGatewayMs, obterOpcoesCheckoutAmbiente, criarGatewayPagamentoMock } = require('./server');

class PedidoCheckoutBuilder {
  constructor() {
    this.payload = {
      clienteEmail: 'cliente@entregasja.com',
      valor: 99.9,
      cartao: {
        numero: '4111111111111111',
        validade: '12/30',
        cvv: '123'
      }
    };
  }

  semEmail() {
    delete this.payload.clienteEmail;
    return this;
  }

  comValor(valor) {
    this.payload.valor = valor;
    return this;
  }

  comCartaoIncompleto() {
    delete this.payload.cartao.cvv;
    return this;
  }

  build() {
    return {
      ...this.payload,
      cartao: { ...this.payload.cartao }
    };
  }
}

const PedidoCheckoutMother = {
  valido: () => new PedidoCheckoutBuilder().build(),
  semEmail: () => new PedidoCheckoutBuilder().semEmail().build(),
  semValorPositivo: () => new PedidoCheckoutBuilder().comValor(0).build(),
  comCartaoIncompleto: () => new PedidoCheckoutBuilder().comCartaoIncompleto().build()
};

const CheckoutServiceMock = {
  naoDeveSerChamado: () => ({
    processar: jest.fn()
  }),
  processaComSucesso: () => ({
    processar: jest.fn(async (pedido) => ({ ...pedido, id: 20, status: 'PROCESSADO' }))
  })
};

describe('POST /api/v1/checkout', () => {
  test('rejeita payload sem clienteEmail antes de chamar o checkout', async () => {
    const checkoutService = CheckoutServiceMock.naoDeveSerChamado();
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(PedidoCheckoutMother.semEmail());

    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ erro: 'Dados incompletos para checkout' });
    expect(checkoutService.processar).not.toHaveBeenCalled();
  });

  test('rejeita valor menor ou igual a zero antes de chamar o checkout', async () => {
    const checkoutService = CheckoutServiceMock.naoDeveSerChamado();
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(PedidoCheckoutMother.semValorPositivo());

    expect(resposta.status).toBe(400);
    expect(checkoutService.processar).not.toHaveBeenCalled();
  });

  test('rejeita cartao incompleto antes de chamar o checkout', async () => {
    const checkoutService = CheckoutServiceMock.naoDeveSerChamado();
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(PedidoCheckoutMother.comCartaoIncompleto());

    expect(resposta.status).toBe(400);
    expect(checkoutService.processar).not.toHaveBeenCalled();
  });

  test('retorna 200 quando o checkout processa o pedido com sucesso', async () => {
    const checkoutService = CheckoutServiceMock.processaComSucesso();
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(PedidoCheckoutMother.valido());

    expect(resposta.status).toBe(200);
    expect(resposta.body.mensagem).toBe('Pedido finalizado com sucesso!');
    expect(checkoutService.processar).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDENTE' })
    );
  });
});

describe('POST /api/v1/checkout - contratos adicionais contra mutantes', () => {
  test('rejeita e-mail invalido antes de chamar o checkout', async () => {
    const checkoutService = CheckoutServiceMock.naoDeveSerChamado();
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send({ ...PedidoCheckoutMother.valido(), clienteEmail: 'email-invalido' });

    expect(resposta.status).toBe(400);
    expect(checkoutService.processar).not.toHaveBeenCalled();
  });

  test('rejeita cartao nulo antes de chamar o checkout', async () => {
    const checkoutService = CheckoutServiceMock.naoDeveSerChamado();
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send({ ...PedidoCheckoutMother.valido(), cartao: null });

    expect(resposta.status).toBe(400);
    expect(checkoutService.processar).not.toHaveBeenCalled();
  });

  test('rejeita cartao sem numero antes de chamar o checkout', async () => {
    const checkoutService = CheckoutServiceMock.naoDeveSerChamado();
    const app = createApp({ checkoutService });
    const pedido = PedidoCheckoutMother.valido();
    delete pedido.cartao.numero;

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(pedido);

    expect(resposta.status).toBe(400);
    expect(checkoutService.processar).not.toHaveBeenCalled();
  });


  test('cartao precisa ser objeto mesmo quando possui campos compativeis', () => {
    const cartaoComoFuncao = () => undefined;
    cartaoComoFuncao.numero = '4111111111111111';
    cartaoComoFuncao.validade = '12/30';
    cartaoComoFuncao.cvv = '123';

    expect(cartaoValido(cartaoComoFuncao)).toBe(false);
  });
  test('retorna 500 com mensagem amigavel quando o checkout nao processa o pedido', async () => {
    const checkoutService = { processar: jest.fn(async () => null) };
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(PedidoCheckoutMother.valido());

    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({
      erro: 'Nao foi possivel processar seu pagamento. Tente mais tarde.'
    });
  });

  test('usa as dependencias padrao do app para processar checkout realista', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const app = createApp();

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(PedidoCheckoutMother.valido());

    expect(resposta.status).toBe(200);
    expect(resposta.body.pedido).toMatchObject({
      id: 5000,
      status: 'PROCESSADO'
    });
    expect(console.log).toHaveBeenCalledWith('E-mail enviado para cliente@entregasja.com');

    Math.random.mockRestore();
    console.log.mockRestore();
  });
});

describe('Rotas operacionais', () => {
  test('expoe rota para limpeza de cache', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const app = createApp({ checkoutService: CheckoutServiceMock.naoDeveSerChamado() });

    const resposta = await request(app).post('/api/v1/cache/flush').send({});

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ status: 'cache_invalidated' });
    expect(console.log).toHaveBeenCalledWith('CACHE LIMPO ABRUPTAMENTE!');

    console.log.mockRestore();
  });
});




describe('Bootstrap HTTP', () => {
  test('startServer inicializa e retorna um servidor fechavel', (done) => {
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const server = startServer(0);

    server.on('listening', () => {
      expect(server.listening).toBe(true);
      expect(console.log).toHaveBeenCalledWith('Servidor da EntregasJa rodando na porta 0');
      server.close(() => {
        console.log.mockRestore();
        done();
      });
    });
  });
});

describe('Gateway parceiro lento', () => {
  const originalGatewayLatency = process.env.GATEWAY_LATENCY_MS;
  const originalCheckoutTimeout = process.env.CHECKOUT_TIMEOUT_MS;
  const originalCheckoutRetries = process.env.CHECKOUT_MAX_RETRIES;
  const originalCheckoutRetryDelay = process.env.CHECKOUT_RETRY_DELAY_MS;

  afterEach(() => {
    if (originalGatewayLatency === undefined) {
      delete process.env.GATEWAY_LATENCY_MS;
    } else {
      process.env.GATEWAY_LATENCY_MS = originalGatewayLatency;
    }
    if (originalCheckoutTimeout === undefined) {
      delete process.env.CHECKOUT_TIMEOUT_MS;
    } else {
      process.env.CHECKOUT_TIMEOUT_MS = originalCheckoutTimeout;
    }
    if (originalCheckoutRetries === undefined) {
      delete process.env.CHECKOUT_MAX_RETRIES;
    } else {
      process.env.CHECKOUT_MAX_RETRIES = originalCheckoutRetries;
    }
    if (originalCheckoutRetryDelay === undefined) {
      delete process.env.CHECKOUT_RETRY_DELAY_MS;
    } else {
      process.env.CHECKOUT_RETRY_DELAY_MS = originalCheckoutRetryDelay;
    }
    jest.useRealTimers();
  });

  test('permite configurar 5000ms de latencia via variavel de ambiente', () => {
    process.env.GATEWAY_LATENCY_MS = '5000';

    expect(obterLatenciaGatewayMs()).toBe(5000);
  });

  test('mantem 300ms como latencia padrao quando a configuracao e invalida', () => {
    process.env.GATEWAY_LATENCY_MS = 'valor-invalido';

    expect(obterLatenciaGatewayMs()).toBe(300);
  });


  test('permite reduzir timeout e retries no cenario de caos gateway lento', () => {
    process.env.CHECKOUT_TIMEOUT_MS = '1000';
    process.env.CHECKOUT_MAX_RETRIES = '1';
    process.env.CHECKOUT_RETRY_DELAY_MS = '100';

    expect(obterOpcoesCheckoutAmbiente()).toEqual({
      timeoutMs: 1000,
      maxRetries: 1,
      retryDelayMs: 100
    });
  });
  test('gateway mock respeita a latencia configurada antes de responder', async () => {
    jest.useFakeTimers();
    const gateway = criarGatewayPagamentoMock({ latencyMs: 5000 });
    const cobranca = gateway.cobrar(10, {});
    let resolvido = false;
    cobranca.then(() => {
      resolvido = true;
    });

    jest.advanceTimersByTime(4999);
    await Promise.resolve();
    expect(resolvido).toBe(false);

    jest.advanceTimersByTime(1);
    await expect(cobranca).resolves.toEqual({ status: 'APROVADO' });
  });
});



