const { montarCheckout, GatewayPagamentoStub, PedidoMother } = require('../../support/CheckoutServiceTestSupport');

describe('CheckoutService - e-mail dispara SOMENTE no sucesso (todos os caminhos infelizes)', () => {
  test('nao envia e-mail quando o circuit breaker esta aberto', async () => {
    const { service, deps } = montarCheckout({
      options: { circuitBreaker: { isOpen: () => true } }
    });

    await service.processar(PedidoMother.valido());

    expect(deps.emailService.enviarConfirmacao).not.toHaveBeenCalled();
  });

  test('nao envia e-mail quando a persistencia do pedido aprovado falha', async () => {
    const { service, deps } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.aprovado(),
      pedidoRepository: { salvar: jest.fn().mockRejectedValue(new Error('db down')) }
    });

    const resultado = await service.processar(PedidoMother.valido());

    expect(resultado).toBeNull();
    expect(deps.emailService.enviarConfirmacao).not.toHaveBeenCalled();
  });
});
