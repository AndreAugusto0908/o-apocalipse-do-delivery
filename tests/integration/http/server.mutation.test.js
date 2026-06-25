const request = require('supertest');
const { createApp, cartaoValido } = require('../../../src/server');
const { PedidoCheckoutMother, CheckoutServiceMock } = require('../../support/ServerTestSupport');

describe('POST /api/v1/checkout - contratos adicionais para mutacao', () => {
  test('rejeita e-mail invalido antes de chamar o checkout', async () => {
    const checkoutService = CheckoutServiceMock.naoDeveSerChamado();
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send({ ...PedidoCheckoutMother.valido(), clienteEmail: 'email-invalido' });

    expect(resposta.status).toBe(400);
    expect(checkoutService.processar).not.toHaveBeenCalled();
  });

  test('rejeita cartao nulo antes de chamar o checkout', async () => {
    const checkoutService = CheckoutServiceMock.naoDeveSerChamado();
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send({ ...PedidoCheckoutMother.valido(), cartao: null });

    expect(resposta.status).toBe(400);
    expect(checkoutService.processar).not.toHaveBeenCalled();
  });

  test('rejeita cartao sem numero antes de chamar o checkout', async () => {
    const checkoutService = CheckoutServiceMock.naoDeveSerChamado();
    const app = createApp({ checkoutService });
    const pedido = PedidoCheckoutMother.valido();
    delete pedido.cartao.numero;

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(pedido);

    expect(resposta.status).toBe(400);
    expect(checkoutService.processar).not.toHaveBeenCalled();
  });

  test('cartao precisa ser objeto mesmo quando possui campos compativeis', () => {
    const cartaoComoFuncao = () => undefined;
    cartaoComoFuncao.numero = '4111111111111111';
    cartaoComoFuncao.validade = '12/30';
    cartaoComoFuncao.cvv = '123';

    expect(cartaoValido(cartaoComoFuncao)).toBe(false);
  });

  test('retorna 500 com mensagem amigavel quando o checkout nao processa o pedido', async () => {
    const checkoutService = { processar: jest.fn(async () => null) };
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(PedidoCheckoutMother.valido());

    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({
      erro: 'Nao foi possivel processar seu pagamento. Tente mais tarde.'
    });
  });

  test('usa as dependencias padrao do app para processar checkout realista', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const app = createApp();

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(PedidoCheckoutMother.valido());

    expect(resposta.status).toBe(200);
    expect(resposta.body.pedido).toMatchObject({
      id: 5000,
      status: 'PROCESSADO'
    });
    expect(console.log).toHaveBeenCalledWith('E-mail enviado para cliente@entregasja.com');

    Math.random.mockRestore();
    console.log.mockRestore();
  });
});

