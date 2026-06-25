const {
  PedidoMother,
  GatewayPagamentoStub,
  EmailServiceMock,
  montarCheckout
} = require('../../support/CheckoutServiceTestSupport');

describe('CheckoutService.processar - fluxo de negocio', () => {
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
});


