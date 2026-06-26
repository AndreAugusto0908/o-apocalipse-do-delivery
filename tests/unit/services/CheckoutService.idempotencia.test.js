const { montarCheckout, PedidoMother } = require('../../support/CheckoutServiceTestSupport');

describe('CheckoutService - idempotencia no pagamento', () => {
  test('envia a mesma chave de idempotencia em todas as tentativas de cobranca', async () => {
    const gateway = {
      cobrar: jest
        .fn()
        .mockRejectedValueOnce(new Error('falha transitoria'))
        .mockResolvedValueOnce({ status: 'APROVADO' })
    };
    const pedido = { ...PedidoMother.valido(), idempotencyKey: 'chave-123' };
    const { service } = montarCheckout({
      gatewayPagamento: gateway,
      options: { retryDelayMs: 0 }
    });

    await service.processar(pedido);

    expect(gateway.cobrar).toHaveBeenCalledTimes(2);
    expect(gateway.cobrar.mock.calls[0][2]).toBe('chave-123');
    expect(gateway.cobrar.mock.calls[1][2]).toBe('chave-123');
  });
});
