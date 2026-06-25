const { CheckoutService } = require('./CheckoutService');

class PedidoBuilder {
  constructor() {
    this.pedido = {
      clienteEmail: 'cliente@entregasja.com',
      valor: 120.5,
      cartao: {
        numero: '4111111111111111',
        validade: '12/30',
        cvv: '123'
      },
      status: 'PENDENTE'
    };
  }

  build() {
    return {
      ...this.pedido,
      cartao: { ...this.pedido.cartao }
    };
  }
}

const PedidoMother = {
  valido: () => new PedidoBuilder().build()
};

const GatewayPagamentoStub = {
  aprovado: () => ({
    cobrar: jest.fn().mockResolvedValue({ status: 'APROVADO' })
  }),
  recusado: () => ({
    cobrar: jest.fn().mockResolvedValue({ status: 'RECUSADO' })
  }),
  aprovaAposErroTransitorio: () => ({
    cobrar: jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ status: 'APROVADO' })
  }),
  sempreIndisponivel: () => ({
    cobrar: jest.fn().mockRejectedValue(new Error('gateway indisponivel'))
  }),
  semResposta: () => ({
    cobrar: jest.fn(() => new Promise(() => {}))
  })
};

const PedidoRepositoryStub = {
  salvandoComId: (id = 10) => ({
    salvar: jest.fn(async (pedido) => ({ ...pedido, id }))
  })
};

const EmailServiceMock = {
  pronto: () => ({
    enviarConfirmacao: jest.fn(async () => undefined)
  }),
  lento: () => ({
    enviarConfirmacao: jest.fn(() => new Promise((resolve) => setTimeout(resolve, 5000)))
  })
};

const montarCheckout = ({
  gatewayPagamento = GatewayPagamentoStub.aprovado(),
  pedidoRepository = PedidoRepositoryStub.salvandoComId(),
  emailService = EmailServiceMock.pronto(),
  options = {}
} = {}) => ({
  deps: { gatewayPagamento, pedidoRepository, emailService },
  service: new CheckoutService({ gatewayPagamento, pedidoRepository, emailService }, options)
});

describe('CheckoutService.processar', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('processa pagamento aprovado, salva o pedido e dispara e-mail sem bloquear o retorno', async () => {
    jest.useFakeTimers();
    const { deps, service } = montarCheckout({
      emailService: EmailServiceMock.lento()
    });

    const resultado = await service.processar(PedidoMother.valido());

    expect(resultado).toMatchObject({ id: 10, status: 'PROCESSADO' });
    expect(deps.pedidoRepository.salvar).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PROCESSADO' })
    );
    expect(deps.emailService.enviarConfirmacao).toHaveBeenCalledWith(
      'cliente@entregasja.com',
      'Pagamento Aprovado'
    );
  });

  test('salva pedido como FALHOU e nao envia e-mail quando o cartao e recusado', async () => {
    const { deps, service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.recusado()
    });

    const resultado = await service.processar(PedidoMother.valido());

    expect(resultado).toBeNull();
    expect(deps.pedidoRepository.salvar).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FALHOU' })
    );
    expect(deps.emailService.enviarConfirmacao).not.toHaveBeenCalled();
  });

  test('recupera erro transitorio de infraestrutura com retry e conclui como PROCESSADO', async () => {
    const { deps, service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.aprovaAposErroTransitorio(),
      options: { retryDelayMs: 1 }
    });

    const resultado = await service.processar(PedidoMother.valido());

    expect(resultado).toMatchObject({ status: 'PROCESSADO' });
    expect(deps.gatewayPagamento.cobrar).toHaveBeenCalledTimes(2);
    expect(deps.pedidoRepository.salvar).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PROCESSADO' })
    );
  });

  test('aplica timeout, esgota retentativas e salva pedido como ERRO_GATEWAY', async () => {
    const { deps, service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.semResposta(),
      options: {
        timeoutMs: 5,
        retryDelayMs: 1,
        maxRetries: 3
      }
    });

    const resultado = await service.processar(PedidoMother.valido());

    expect(resultado).toBeNull();
    expect(deps.gatewayPagamento.cobrar).toHaveBeenCalledTimes(4);
    expect(deps.pedidoRepository.salvar).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ERRO_GATEWAY' })
    );
    expect(deps.emailService.enviarConfirmacao).not.toHaveBeenCalled();
  });

  test('salva pedido como ERRO_GATEWAY quando erros de infraestrutura persistem', async () => {
    const { deps, service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.sempreIndisponivel(),
      options: {
        retryDelayMs: 1,
        maxRetries: 3
      }
    });

    const resultado = await service.processar(PedidoMother.valido());

    expect(resultado).toBeNull();
    expect(deps.gatewayPagamento.cobrar).toHaveBeenCalledTimes(4);
    expect(deps.pedidoRepository.salvar).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ERRO_GATEWAY' })
    );
    expect(deps.emailService.enviarConfirmacao).not.toHaveBeenCalled();
  });

  test('aciona fallback sem chamar gateway quando circuit breaker esta aberto', async () => {
    const circuitBreaker = { isOpen: jest.fn(() => true) };
    const { deps, service } = montarCheckout({
      options: { circuitBreaker }
    });

    const resultado = await service.processar(PedidoMother.valido());

    expect(resultado).toBeNull();
    expect(deps.gatewayPagamento.cobrar).not.toHaveBeenCalled();
    expect(deps.pedidoRepository.salvar).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ERRO_GATEWAY' })
    );
  });
});

describe('CheckoutService - contratos adicionais contra mutantes', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('preserva opcoes customizadas de resiliencia no construtor', () => {
    const { service } = montarCheckout({
      options: {
        timeoutMs: 123,
        retryDelayMs: 7,
        maxRetries: 2
      }
    });

    expect(service.timeoutMs).toBe(123);
    expect(service.retryDelayMs).toBe(7);
    expect(service.maxRetries).toBe(2);
  });

  test('nao quebra quando circuit breaker existe sem metodo isOpen', () => {
    const { service } = montarCheckout({
      options: { circuitBreaker: {} }
    });

    expect(() => service.gatewayIndisponivel()).not.toThrow();
    expect(service.gatewayIndisponivel()).toBeUndefined();
  });

  test('retorna erro de timeout com mensagem contratada', async () => {
    const { service } = montarCheckout({
      options: { timeoutMs: 1 }
    });

    await expect(service.comTimeout(new Promise(() => {}))).rejects.toThrow('TIMEOUT_GATEWAY');
  });

  test('esperar retorna uma Promise para manter o backoff assincrono', () => {
    const { service } = montarCheckout();

    expect(service.esperar(1)).toBeInstanceOf(Promise);
  });

  test('registra ERRO_GATEWAY quando a persistencia falha apos pagamento aprovado', async () => {
    const pedidoRepository = {
      salvar: jest
        .fn()
        .mockRejectedValueOnce(new Error('db indisponivel'))
        .mockResolvedValueOnce({ ...PedidoMother.valido(), status: 'ERRO_GATEWAY', id: 99 })
    };
    const { deps, service } = montarCheckout({ pedidoRepository });

    const resultado = await service.processar(PedidoMother.valido());

    expect(resultado).toBeNull();
    expect(deps.pedidoRepository.salvar).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'ERRO_GATEWAY' })
    );
    expect(console.error).toHaveBeenCalledWith(
      'Falha ao persistir ou finalizar pedido:',
      'db indisponivel'
    );
  });

  test('registra falha de envio de e-mail sem rejeitar o fluxo principal', async () => {
    const emailService = {
      enviarConfirmacao: jest.fn().mockRejectedValue(new Error('smtp fora'))
    };
    const { deps, service } = montarCheckout({ emailService });

    const resultado = await service.processar(PedidoMother.valido());
    await Promise.resolve();

    expect(resultado).toMatchObject({ status: 'PROCESSADO' });
    expect(deps.emailService.enviarConfirmacao).toHaveBeenCalledWith(
      'cliente@entregasja.com',
      'Pagamento Aprovado'
    );
    expect(console.error).toHaveBeenCalledWith(
      'Falha ao enviar e-mail de confirmacao:',
      'smtp fora'
    );
  });
});


describe('CheckoutService - eliminacao adicional de mutantes de erro', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('nao tenta processar resultado de pagamento quando gateway nao retorna resposta', async () => {
    const { service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.sempreIndisponivel(),
      options: { maxRetries: 0 }
    });
    jest.spyOn(service, 'processarResultadoPagamento');

    await service.processar(PedidoMother.valido());

    expect(service.processarResultadoPagamento).not.toHaveBeenCalled();
  });

  test('nao aplica backoff apos a ultima tentativa de gateway', async () => {
    const { service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.sempreIndisponivel(),
      options: { maxRetries: 0, retryDelayMs: 1 }
    });
    jest.spyOn(service, 'esperar');

    await service.processar(PedidoMother.valido());

    expect(service.esperar).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'Falha no gateway de pagamento:',
      'gateway indisponivel'
    );
  });
});

describe('CheckoutService - limpeza de recursos de timeout', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('limpa o timeout quando a operacao termina antes do limite', async () => {
    const { service } = montarCheckout({
      options: { timeoutMs: 1000 }
    });
    jest.spyOn(global, 'clearTimeout');

    await expect(service.comTimeout(Promise.resolve('ok'))).resolves.toBe('ok');

    expect(clearTimeout).toHaveBeenCalled();
  });
});
