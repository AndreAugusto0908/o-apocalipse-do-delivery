class CheckoutService {
  constructor(dependencies, options = {}) {
    this.gatewayPagamento = dependencies.gatewayPagamento;
    this.pedidoRepository = dependencies.pedidoRepository;
    this.emailService = dependencies.emailService;
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.circuitBreaker = options.circuitBreaker;
    this.resultadoPagamentoHandlers = criarResultadoPagamentoHandlers(this);
  }

  async processar(pedido) {
    if (this.gatewayIndisponivel()) {
      return this.registrarErroGateway(pedido);
    }

    const resposta = await this.cobrarComResiliencia(pedido);

    if (!resposta) {
      return this.registrarErroGateway(pedido);
    }

    try {
      return await this.processarResultadoPagamento(pedido, resposta);
    } catch (error) {
      console.error('Falha ao persistir ou finalizar pedido:', error.message);
      return this.registrarErroGateway(pedido);
    }
  }

  gatewayIndisponivel() {
    return this.circuitBreaker?.isOpen?.();
  }

  processarResultadoPagamento(pedido, resposta) {
    return this.obterHandlerResultadoPagamento(resposta).processar(pedido);
  }

  obterHandlerResultadoPagamento(resposta) {
    return this.resultadoPagamentoHandlers[resposta.status] ?? this.resultadoPagamentoHandlers.RECUSADO;
  }

  async cobrarComResiliencia(pedido) {
    const totalTentativas = this.maxRetries + 1;

    for (let tentativa = 1; tentativa <= totalTentativas; tentativa += 1) {
      try {
        return await this.comTimeout(
          this.gatewayPagamento.cobrar(pedido.valor, pedido.cartao)
        );
      } catch (error) {
        console.error('Falha no gateway de pagamento:', error.message);

        if (tentativa === totalTentativas) {
          return null;
        }

        await this.esperar(this.retryDelayMs);
      }
    }

    return null;
  }

  comTimeout(operacao) {
    let timeoutId;

    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('TIMEOUT_GATEWAY'));
      }, this.timeoutMs);
    });

    return Promise.race([operacao, timeout]).finally(() => clearTimeout(timeoutId));
  }

  esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  enviarConfirmacaoSemBloquear(email) {
    this.emailService
      .enviarConfirmacao(email, 'Pagamento Aprovado')
      .catch((error) => console.error('Falha ao enviar e-mail de confirmacao:', error.message));
  }

  async registrarErroGateway(pedido) {
    pedido.status = 'ERRO_GATEWAY';
    await this.pedidoRepository.salvar(pedido);
    return null;
  }
}

class PagamentoAprovadoHandler {
  constructor(checkoutService) {
    this.checkoutService = checkoutService;
  }

  async processar(pedido) {
    pedido.status = 'PROCESSADO';
    const pedidoSalvo = await this.checkoutService.pedidoRepository.salvar(pedido);

    this.checkoutService.enviarConfirmacaoSemBloquear(pedido.clienteEmail);

    return pedidoSalvo;
  }
}

class PagamentoRecusadoHandler {
  constructor(checkoutService) {
    this.checkoutService = checkoutService;
  }

  async processar(pedido) {
    pedido.status = 'FALHOU';
    await this.checkoutService.pedidoRepository.salvar(pedido);
    return null;
  }
}

const criarResultadoPagamentoHandlers = (checkoutService) => ({
  APROVADO: new PagamentoAprovadoHandler(checkoutService),
  RECUSADO: new PagamentoRecusadoHandler(checkoutService)
});

module.exports = { CheckoutService };
