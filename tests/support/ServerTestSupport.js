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

module.exports = {
  PedidoCheckoutMother,
  CheckoutServiceMock
};
