const {
  montarCheckout,
  GatewayPagamentoStub,
  EmailServiceMock,
  PedidoMother
} = require('../../support/CheckoutServiceTestSupport');

const repositorioQueTrava = () => ({
  salvar: jest.fn(() => new Promise(() => {}))
});

describe('CheckoutService - timeout em todas as chamadas externas', () => {
  test('nao trava quando o repositorio nao responde ao salvar erro de gateway', async () => {
    const { service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.sempreIndisponivel(),
      pedidoRepository: repositorioQueTrava(),
      options: { maxRetries: 0, retryDelayMs: 0, timeoutMs: 50, repoTimeoutMs: 50 }
    });

    const resultado = await service.processar(PedidoMother.valido());

    expect(resultado).toBeNull();
  }, 1500);

  test('aplica timeout no salvar do pedido aprovado e degrada para fallback sem enviar e-mail', async () => {
    const emailService = EmailServiceMock.pronto();
    const { service } = montarCheckout({
      gatewayPagamento: GatewayPagamentoStub.aprovado(),
      pedidoRepository: repositorioQueTrava(),
      emailService,
      options: { timeoutMs: 50, repoTimeoutMs: 50 }
    });

    const resultado = await service.processar(PedidoMother.valido());

    expect(resultado).toBeNull();
    expect(emailService.enviarConfirmacao).not.toHaveBeenCalled();
  }, 1500);
});
