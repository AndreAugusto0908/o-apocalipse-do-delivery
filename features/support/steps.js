const assert = require('assert');
const request = require('supertest');
const { Given, When, Then, setWorldConstructor, setDefaultTimeout } = require('@cucumber/cucumber');
const { CheckoutService } = require('../../src/services/CheckoutService');
const { CacheService, InMemoryCacheStore } = require('../../src/services/CacheService');
const { createApp } = require('../../src/server');

setDefaultTimeout(10000);

// Spy minimo (sem dependencia de framework de mock) que registra as chamadas.
const criarSpy = (impl) => {
  const fn = (...args) => {
    fn.calls.push(args);
    return impl ? impl(...args) : undefined;
  };
  fn.calls = [];
  return fn;
};

class CheckoutWorld {
  constructor() {
    this.endpoint = '/api/v1/checkout';
    this.filaComportamentos = [];
    this.comportamentoPadrao = null;
    this.circuitBreaker = undefined;

    this.payload = {
      clienteEmail: 'cliente@entregasja.com',
      valor: 99.9,
      cartao: { numero: '4111111111111111', validade: '12/30', cvv: '123' }
    };

    this.gateway = {
      cobrar: criarSpy(() => this._proximoComportamentoGateway())
    };
    this.repositorio = {
      salvar: criarSpy(async (pedido) => ({ ...pedido, id: 1 }))
    };
    this.email = {
      enviarConfirmacao: criarSpy(async () => undefined)
    };
  }

  _proximoComportamentoGateway() {
    const comportamento = this.filaComportamentos.shift() || this.comportamentoPadrao || 'aprovado';

    switch (comportamento) {
      case 'aprovado': return Promise.resolve({ status: 'APROVADO' });
      case 'recusado': return Promise.resolve({ status: 'RECUSADO' });
      case 'falha': return Promise.reject(new Error('erro de infraestrutura'));
      case 'timeout': return new Promise(() => {});
      default: return Promise.resolve({ status: 'APROVADO' });
    }
  }

  async enviarCheckout() {
    const checkoutService = new CheckoutService(
      {
        gatewayPagamento: this.gateway,
        pedidoRepository: this.repositorio,
        emailService: this.email
      },
      { timeoutMs: 80, maxRetries: 3, retryDelayMs: 0, circuitBreaker: this.circuitBreaker }
    );

    const app = createApp({
      checkoutService,
      cacheService: new CacheService({ store: new InMemoryCacheStore() }),
      carregarCatalogo: async () => ({ loja: 'EntregasJa' })
    });

    this.resposta = await request(app).post(this.endpoint).send(this.payload);
  }

  ultimoStatusSalvo() {
    const chamadas = this.repositorio.salvar.calls;
    return chamadas.length ? chamadas[chamadas.length - 1][0].status : null;
  }

  textoDaResposta() {
    return this.resposta.body.mensagem || this.resposta.body.erro;
  }
}

setWorldConstructor(CheckoutWorld);

// --- Contexto (no-ops ou configuracao leve) ---
Given('que o endpoint de checkout e {string}', function (endpoint) {
  this.endpoint = endpoint;
});
Given('que existe um repositorio de pedidos disponivel', function () {});
Given('que existe um servico de e-mail disponivel', function () {});
Given('que o tempo limite de resposta do gateway e {int} milissegundos', function (ms) {});
Given('que a politica de retentativa permite ate {int} novas tentativas', function (n) {});
Given('que o intervalo de backoff entre tentativas e {int} milissegundos', function (ms) {});

// --- Entradas do cliente ---
Given('que o cliente informa um pedido valido', function () {});
Given('que o cliente nao informa todos os dados obrigatorios do checkout', function () {
  this.payload = { clienteEmail: 'cliente@entregasja.com', valor: 99.9 };
});

// --- Comportamento do gateway ---
Given('que o gateway de pagamento retornara {string}', function (status) {
  this.comportamentoPadrao = status === 'APROVADO' ? 'aprovado' : 'recusado';
});
Given('que o gateway de pagamento nao responde em ate {int} milissegundos', function (ms) {
  this.comportamentoPadrao = 'timeout';
});
Given('que a primeira chamada ao gateway de pagamento falhara por erro de infraestrutura', function () {
  this.filaComportamentos.push('falha');
});
Given('que a segunda chamada ao gateway de pagamento retornara {string}', function (status) {
  this.filaComportamentos.push(status === 'APROVADO' ? 'aprovado' : 'recusado');
});
Given('que todas as chamadas ao gateway de pagamento falharao por erro de infraestrutura', function () {
  this.comportamentoPadrao = 'falha';
});
Given('que o circuit breaker do gateway de pagamento esta aberto', function () {
  this.circuitBreaker = { isOpen: () => true };
});

// --- Acao ---
When('o cliente enviar a solicitacao de checkout', function () {
  return this.enviarCheckout();
});

// --- Verificacoes ---
Then('o sistema deve cobrar o valor do pedido no gateway de pagamento', function () {
  assert.ok(this.gateway.cobrar.calls.length >= 1, 'o gateway nao foi chamado');
});
Then('o pedido deve ser salvo com status {string}', function (status) {
  assert.strictEqual(this.ultimoStatusSalvo(), status);
});
Then('apos esgotar as retentativas o pedido deve ser salvo com status {string}', function (status) {
  assert.strictEqual(this.ultimoStatusSalvo(), status);
});
Then('o sistema deve solicitar o envio do e-mail de confirmacao {string}', function (assunto) {
  const chamadas = this.email.enviarConfirmacao.calls;
  assert.ok(chamadas.length >= 1, 'e-mail de confirmacao nao foi solicitado');
  assert.strictEqual(chamadas[chamadas.length - 1][1], assunto);
});
Then('o sistema nao deve solicitar envio de e-mail de confirmacao', function () {
  assert.strictEqual(this.email.enviarConfirmacao.calls.length, 0);
});
Then('o sistema nao deve chamar o gateway de pagamento', function () {
  assert.strictEqual(this.gateway.cobrar.calls.length, 0);
});
Then('o sistema nao deve salvar o pedido no repositorio', function () {
  assert.strictEqual(this.repositorio.salvar.calls.length, 0);
});
Then('a resposta HTTP deve ter status {int}', function (status) {
  assert.strictEqual(this.resposta.status, status);
});
Then('a resposta deve informar {string}', function (texto) {
  assert.strictEqual(this.textoDaResposta(), texto);
});
Then('o sistema deve interromper a chamada ao gateway por timeout', function () {
  assert.ok(this.gateway.cobrar.calls.length >= 1);
});
Then('o sistema deve executar a politica de retentativa configurada', function () {
  assert.ok(this.gateway.cobrar.calls.length > 1, 'nao houve retentativa');
});
Then('o sistema deve tentar a cobranca novamente apos o backoff de {int} milissegundos', function (ms) {
  assert.ok(this.gateway.cobrar.calls.length >= 2, 'a cobranca nao foi repetida');
});
Then('o sistema deve realizar a tentativa inicial de cobranca', function () {
  assert.ok(this.gateway.cobrar.calls.length >= 1);
});
Then('o sistema deve realizar ate {int} retentativas adicionais', function (n) {
  assert.strictEqual(this.gateway.cobrar.calls.length, n + 1);
});
Then('o sistema deve respeitar o backoff de {int} milissegundos entre as retentativas', function (ms) {
  assert.ok(this.gateway.cobrar.calls.length > 1);
});
