const { montarCheckout, GatewayPagamentoStub, PedidoMother } = require('../../support/CheckoutServiceTestSupport');

describe('CheckoutService - reforco de mutacao', () => {
  test('processa com sucesso mesmo se o circuit breaker nao expoe registrarSucesso', async () => {
    const circuitBreaker = { isOpen: () => false };
    const { service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.aprovado(),
      options: { circuitBreaker }
    });

    const resultado = await service.processar(PedidoMother.valido());

    expect(resultado.status).toBe('PROCESSADO');
  });

  test('falha graciosamente mesmo se o circuit breaker nao expoe registrarFalha', async () => {
    const circuitBreaker = { isOpen: () => false };
    const { service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.sempreIndisponivel(),
      options: { circuitBreaker, maxRetries: 0, retryDelayMs: 0 }
    });

    const resultado = await service.processar(PedidoMother.valido());

    expect(resultado).toBeNull();
  });

  test('persistir rejeita com TIMEOUT_REPOSITORIO quando o repositorio nao responde', async () => {
    const { service } = montarCheckout({
      pedidoRepository: { salvar: () => new Promise(() => {}) },
      options: { repoTimeoutMs: 30 }
    });

    await expect(service.persistir({ id: 1 })).rejects.toThrow('TIMEOUT_REPOSITORIO');
  }, 1500);

  test('usa repoTimeoutMs (e nao o timeoutMs do gateway) ao persistir', async () => {
    // timeoutMs alto x repoTimeoutMs baixo: se o codigo trocasse um pelo outro,
    // a persistencia so estouraria em 5s e o teste excederia o limite do jest.
    const { service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.aprovado(),
      pedidoRepository: { salvar: () => new Promise(() => {}) },
      options: { timeoutMs: 5000, repoTimeoutMs: 40, maxRetries: 0 }
    });

    const resultado = await service.processar(PedidoMother.valido());

    expect(resultado).toBeNull();
  }, 1500);
});
