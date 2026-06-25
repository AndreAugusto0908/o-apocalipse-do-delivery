const {
  PedidoMother,
  GatewayPagamentoStub,
  montarCheckout
} = require('../../support/CheckoutServiceTestSupport');

describe('CheckoutService.processar - resiliencia e caos', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  test('calcula backoff exponencial com jitter deterministico', () => {
    const { service } = montarCheckout({
      options: {
        retryDelayMs: 500,
        jitterRatio: 0.2,
        random: () => 0.5
      }
    });

    expect(service.calcularBackoffComJitter(1)).toBe(550);
    expect(service.calcularBackoffComJitter(2)).toBe(1100);
    expect(service.calcularBackoffComJitter(3)).toBe(2200);
  });

  test('usa backoff com jitter entre tentativas de gateway', async () => {
    const { service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.aprovaAposErroTransitorio(),
      options: {
        retryDelayMs: 10,
        jitterRatio: 0.5,
        random: () => 1
      }
    });
    jest.spyOn(service, 'esperar').mockResolvedValue(undefined);

    await service.processar(PedidoMother.valido());

    expect(service.esperar).toHaveBeenCalledWith(15);
  });
});


