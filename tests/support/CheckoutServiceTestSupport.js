const { CheckoutService } = require('../../src/services/CheckoutService');

class PedidoBuilder {
  constructor() {
    this.pedido = {
      clienteEmail: 'cliente@entregasja.com',
      valor: 120.5,
      cartao: {
        numero: '4111111111111111',
        validade: '12/30',
        cvv: '123'
      },
      status: 'PENDENTE'
    };
  }

  comEmail(clienteEmail) {
    this.pedido.clienteEmail = clienteEmail;
    return this;
  }

  comValor(valor) {
    this.pedido.valor = valor;
    return this;
  }

  comCartao(cartao) {
    this.pedido.cartao = cartao;
    return this;
  }

  semCartao() {
    this.pedido.cartao = undefined;
    return this;
  }

  build() {
    return {
      ...this.pedido,
      cartao: this.pedido.cartao ? { ...this.pedido.cartao } : undefined
    };
  }
}

const PedidoMother = {
  valido: () => new PedidoBuilder().build(),
  comValor: (valor) => new PedidoBuilder().comValor(valor).build(),
  semCartao: () => new PedidoBuilder().semCartao().build()
};

const GatewayPagamentoStub = {
  aprovado: () => ({
    cobrar: jest.fn().mockResolvedValue({ status: 'APROVADO' })
  }),
  recusado: () => ({
    cobrar: jest.fn().mockResolvedValue({ status: 'RECUSADO' })
  }),
  aprovaAposErroTransitorio: () => ({
    cobrar: jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ status: 'APROVADO' })
  }),
  sempreIndisponivel: () => ({
    cobrar: jest.fn().mockRejectedValue(new Error('gateway indisponivel'))
  }),
  semResposta: () => ({
    cobrar: jest.fn(() => new Promise(() => {}))
  })
};

const PedidoRepositoryStub = {
  salvandoComId: (id = 10) => ({
    salvar: jest.fn(async (pedido) => ({ ...pedido, id }))
  })
};

const EmailServiceMock = {
  pronto: () => ({
    enviarConfirmacao: jest.fn(async () => undefined)
  }),
  lento: () => ({
    enviarConfirmacao: jest.fn(() => new Promise((resolve) => setTimeout(resolve, 5000)))
  })
};

const montarCheckout = ({
  gatewayPagamento = GatewayPagamentoStub.aprovado(),
  pedidoRepository = PedidoRepositoryStub.salvandoComId(),
  emailService = EmailServiceMock.pronto(),
  options = {}
} = {}) => ({
  deps: { gatewayPagamento, pedidoRepository, emailService },
  service: new CheckoutService({ gatewayPagamento, pedidoRepository, emailService }, options)
});

module.exports = {
  PedidoMother,
  GatewayPagamentoStub,
  PedidoRepositoryStub,
  EmailServiceMock,
  montarCheckout
};

