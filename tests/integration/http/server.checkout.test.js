const request = require('supertest');
const { createApp } = require('../../../src/server');
const { PedidoCheckoutMother, CheckoutServiceMock } = require('../../support/ServerTestSupport');

describe('POST /api/v1/checkout - contrato principal', () => {
  test('rejeita payload sem clienteEmail antes de chamar o checkout', async () => {
    const checkoutService = CheckoutServiceMock.naoDeveSerChamado();
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(PedidoCheckoutMother.semEmail());

    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ erro: 'Dados incompletos para checkout' });
    expect(checkoutService.processar).not.toHaveBeenCalled();
  });

  test('rejeita valor menor ou igual a zero antes de chamar o checkout', async () => {
    const checkoutService = CheckoutServiceMock.naoDeveSerChamado();
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(PedidoCheckoutMother.semValorPositivo());

    expect(resposta.status).toBe(400);
    expect(checkoutService.processar).not.toHaveBeenCalled();
  });

  test('rejeita cartao incompleto antes de chamar o checkout', async () => {
    const checkoutService = CheckoutServiceMock.naoDeveSerChamado();
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(PedidoCheckoutMother.comCartaoIncompleto());

    expect(resposta.status).toBe(400);
    expect(checkoutService.processar).not.toHaveBeenCalled();
  });

  test('retorna 200 quando o checkout processa o pedido com sucesso', async () => {
    const checkoutService = CheckoutServiceMock.processaComSucesso();
    const app = createApp({ checkoutService });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .send(PedidoCheckoutMother.valido());

    expect(resposta.status).toBe(200);
    expect(resposta.body.mensagem).toBe('Pedido finalizado com sucesso!');
    expect(checkoutService.processar).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDENTE' })
    );
  });
});

