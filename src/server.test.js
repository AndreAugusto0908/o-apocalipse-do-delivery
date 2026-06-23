const request = require('supertest');
const { createApp } = require('./server');

class PedidoCheckoutBuilder {
  constructor() {
    this.payload = {
      clienteEmail: 'cliente@entregasja.com',
      valor: 99.9,
      cartao: {
        numero: '4111111111111111',
        validade: '12/30',
        cvv: '123'
      }
    };
  }

  semEmail() {
    delete this.payload.clienteEmail;
    return this;
  }

  comValor(valor) {
    this.payload.valor = valor;
    return this;
  }

  comCartaoIncompleto() {
    delete this.payload.cartao.cvv;
    return this;
  }

  build() {
    return {
      ...this.payload,
      cartao: { ...this.payload.cartao }
    };
  }
}

const PedidoCheckoutMother = {
  valido: () => new PedidoCheckoutBuilder().build(),
  semEmail: () => new PedidoCheckoutBuilder().semEmail().build(),
  semValorPositivo: () => new PedidoCheckoutBuilder().comValor(0).build(),
  comCartaoIncompleto: () => new PedidoCheckoutBuilder().comCartaoIncompleto().build()
};

const CheckoutServiceMock = {
  naoDeveSerChamado: () => ({
    processar: jest.fn()
  }),
  processaComSucesso: () => ({
    processar: jest.fn(async (pedido) => ({ ...pedido, id: 20, status: 'PROCESSADO' }))
  })
};

describe('POST /api/v1/checkout', () => {
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
