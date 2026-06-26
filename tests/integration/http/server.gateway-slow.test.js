const {
  obterLatenciaGatewayMs,
  obterOpcoesCheckoutAmbiente,
  criarGatewayPagamentoMock
} = require('../../../src/server');

describe('Gateway parceiro lento', () => {
  const originalGatewayLatency = process.env.GATEWAY_LATENCY_MS;
  const originalCheckoutTimeout = process.env.CHECKOUT_TIMEOUT_MS;
  const originalCheckoutRetries = process.env.CHECKOUT_MAX_RETRIES;
  const originalCheckoutRetryDelay = process.env.CHECKOUT_RETRY_DELAY_MS;

  afterEach(() => {
    if (originalGatewayLatency === undefined) {
      delete process.env.GATEWAY_LATENCY_MS;
    } else {
      process.env.GATEWAY_LATENCY_MS = originalGatewayLatency;
    }
    if (originalCheckoutTimeout === undefined) {
      delete process.env.CHECKOUT_TIMEOUT_MS;
    } else {
      process.env.CHECKOUT_TIMEOUT_MS = originalCheckoutTimeout;
    }
    if (originalCheckoutRetries === undefined) {
      delete process.env.CHECKOUT_MAX_RETRIES;
    } else {
      process.env.CHECKOUT_MAX_RETRIES = originalCheckoutRetries;
    }
    if (originalCheckoutRetryDelay === undefined) {
      delete process.env.CHECKOUT_RETRY_DELAY_MS;
    } else {
      process.env.CHECKOUT_RETRY_DELAY_MS = originalCheckoutRetryDelay;
    }
    jest.useRealTimers();
  });

  test('permite configurar 5000ms de latencia via variavel de ambiente', () => {
    process.env.GATEWAY_LATENCY_MS = '5000';

    expect(obterLatenciaGatewayMs()).toBe(5000);
  });

  test('mantem 300ms como latencia padrao quando a configuracao e invalida', () => {
    process.env.GATEWAY_LATENCY_MS = 'valor-invalido';

    expect(obterLatenciaGatewayMs()).toBe(300);
  });

  test('permite reduzir timeout e retries no cenario de caos gateway lento', () => {
    process.env.CHECKOUT_TIMEOUT_MS = '1000';
    process.env.CHECKOUT_MAX_RETRIES = '1';
    process.env.CHECKOUT_RETRY_DELAY_MS = '100';

    expect(obterOpcoesCheckoutAmbiente()).toEqual({
      timeoutMs: 1000,
      repoTimeoutMs: 1000,
      maxRetries: 1,
      retryDelayMs: 100
    });
  });

  test('aceita zero como valor explicito para configuracoes numericas', () => {
    process.env.CHECKOUT_MAX_RETRIES = '0';

    expect(obterOpcoesCheckoutAmbiente().maxRetries).toBe(0);
  });

  test('ignora valores negativos em configuracoes numericas', () => {
    process.env.CHECKOUT_TIMEOUT_MS = '-1';

    expect(obterOpcoesCheckoutAmbiente().timeoutMs).toBe(2000);
  });

  test('gateway mock respeita a latencia configurada antes de responder', async () => {
    jest.useFakeTimers();
    const gateway = criarGatewayPagamentoMock({ latencyMs: 5000 });
    const cobranca = gateway.cobrar(10, {});
    let resolvido = false;
    cobranca.then(() => {
      resolvido = true;
    });

    jest.advanceTimersByTime(4999);
    await Promise.resolve();
    expect(resolvido).toBe(false);

    jest.advanceTimersByTime(1);
    await expect(cobranca).resolves.toEqual({ status: 'APROVADO' });
  });
});

