const { CircuitBreaker } = require('../../../src/services/CircuitBreaker');
const {
  montarCheckout,
  GatewayPagamentoStub,
  PedidoMother
} = require('../../support/CheckoutServiceTestSupport');

const breakerEspiao = () => ({
  isOpen: jest.fn(() => false),
  registrarSucesso: jest.fn(),
  registrarFalha: jest.fn()
});

describe('CheckoutService + CircuitBreaker', () => {
  test('registra sucesso no breaker quando o pagamento e aprovado', async () => {
    const circuitBreaker = breakerEspiao();
    const { service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.aprovado(),
      options: { circuitBreaker }
    });

    await service.processar(PedidoMother.valido());

    expect(circuitBreaker.registrarSucesso).toHaveBeenCalledTimes(1);
    expect(circuitBreaker.registrarFalha).not.toHaveBeenCalled();
  });

  test('registra falha no breaker a cada tentativa malsucedida do gateway', async () => {
    const circuitBreaker = breakerEspiao();
    const { service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.sempreIndisponivel(),
      options: { maxRetries: 2, retryDelayMs: 0, circuitBreaker }
    });

    await service.processar(PedidoMother.valido());

    expect(circuitBreaker.registrarFalha).toHaveBeenCalledTimes(3);
    expect(circuitBreaker.registrarSucesso).not.toHaveBeenCalled();
  });

  test('breaker real abre apos falhas e passa a bloquear o gateway', async () => {
    const circuitBreaker = new CircuitBreaker({
      minimumRequests: 2, threshold: 0.5, resetTimeoutMs: 60000, now: () => 0
    });
    const gateway = GatewayPagamentoStub.sempreIndisponivel();
    const { service } = montarCheckout({
      gatewayPagamento: gateway,
      options: { maxRetries: 1, retryDelayMs: 0, circuitBreaker }
    });

    await service.processar(PedidoMother.valido());
    const chamadasAposPrimeira = gateway.cobrar.mock.calls.length;
    expect(circuitBreaker.isOpen()).toBe(true);

    const resultado = await service.processar(PedidoMother.valido());

    expect(gateway.cobrar.mock.calls.length).toBe(chamadasAposPrimeira);
    expect(resultado).toBeNull();
  });
});
