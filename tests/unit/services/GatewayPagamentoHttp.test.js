const { GatewayPagamentoHttp } = require('../../../src/services/GatewayPagamentoHttp');

const respostaFake = ({ ok = true, status = 200, body = {} }) => ({
  ok,
  status,
  json: async () => body
});

describe('GatewayPagamentoHttp', () => {
  test('cobra via POST e retorna o JSON do gateway', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(respostaFake({ body: { status: 'APROVADO' } }));
    const gateway = new GatewayPagamentoHttp({ baseUrl: 'http://gw:9000', fetchImpl });

    const resultado = await gateway.cobrar(100, { numero: '4111' }, 'idem-1');

    expect(resultado).toEqual({ status: 'APROVADO' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://gw:9000/cobrar');
    expect(init.method).toBe('POST');
  });

  test('envia a chave de idempotencia no header', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(respostaFake({ body: { status: 'APROVADO' } }));
    const gateway = new GatewayPagamentoHttp({ baseUrl: 'http://gw:9000', fetchImpl });

    await gateway.cobrar(100, {}, 'idem-1');

    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers['Idempotency-Key']).toBe('idem-1');
  });

  test('lanca erro quando o gateway responde status nao-ok (aciona retry/circuit breaker)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(respostaFake({ ok: false, status: 503 }));
    const gateway = new GatewayPagamentoHttp({ baseUrl: 'http://gw:9000', fetchImpl });

    await expect(gateway.cobrar(100, {}, 'idem-1')).rejects.toThrow('GATEWAY_HTTP_503');
  });

  test('passa um AbortSignal para o fetch', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(respostaFake({ body: { status: 'APROVADO' } }));
    const gateway = new GatewayPagamentoHttp({ baseUrl: 'http://gw:9000', fetchImpl });

    await gateway.cobrar(100, {}, 'idem-1');

    const [, init] = fetchImpl.mock.calls[0];
    expect(init.signal).toBeDefined();
  });

  test('aborta a requisicao e fecha o socket quando excede o timeout', async () => {
    const fetchImpl = jest.fn((url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const erro = new Error('The operation was aborted');
        erro.name = 'AbortError';
        reject(erro);
      });
    }));
    const gateway = new GatewayPagamentoHttp({ baseUrl: 'http://gw:9000', fetchImpl, timeoutMs: 20 });

    await expect(gateway.cobrar(100, {}, 'idem-1')).rejects.toThrow('GATEWAY_TIMEOUT');
  });
});
