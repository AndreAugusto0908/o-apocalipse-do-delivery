const {
  PedidoMother,
  GatewayPagamentoStub,
  montarCheckout
} = require('../../support/CheckoutServiceTestSupport');

describe('CheckoutService - contratos adicionais para teste de mutacao', () => {
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

  test('limpa o timeout quando a operacao termina antes do limite', async () => {
    const { service } = montarCheckout({
      options: { timeoutMs: 1000 }
    });
    jest.spyOn(global, 'clearTimeout');

    await expect(service.comTimeout(Promise.resolve('ok'))).resolves.toBe('ok');

    expect(clearTimeout).toHaveBeenCalled();
  });
});


