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

  build() {
    return {
      ...this.pedido,
      cartao: { ...this.pedido.cartao }
    };
  }
}

const PedidoMother = {
  valido: () => new PedidoBuilder().build()
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

