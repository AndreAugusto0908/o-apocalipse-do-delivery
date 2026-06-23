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
