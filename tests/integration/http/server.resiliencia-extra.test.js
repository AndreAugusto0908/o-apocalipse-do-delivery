const request = require('supertest');
const { createApp, checkoutProcessado } = require('../../../src/server');
const { Bulkhead } = require('../../../src/services/Bulkhead');
const { PedidoCheckoutMother } = require('../../support/ServerTestSupport');

describe('checkoutProcessado', () => {
  test('verdadeiro apenas para status PROCESSADO', () => {
    expect(checkoutProcessado({ status: 'PROCESSADO' })).toBe(true);
    expect(checkoutProcessado({ status: 'FALHOU' })).toBe(false);
    expect(checkoutProcessado(null)).toBe(false);
  });
});

describe('rota de checkout - caminhos de erro e limites', () => {
  test('responde 500 (e nao 503) quando o erro NAO e de bulkhead', async () => {
    const checkoutService = { processar: jest.fn().mockRejectedValue(new Error('falha generica')) };
    const app = createApp({ checkoutService });

    const res = await request(app).post('/api/v1/checkout').send(PedidoCheckoutMother.valido());

    expect(res.status).toBe(500);
  });

  test('responde 503 com mensagem de sobrecarga quando o bulkhead enche', async () => {
    const checkoutService = { processar: jest.fn() };
    const bulkhead = new Bulkhead({ maxConcurrent: 0, maxQueue: 0 });
    const app = createApp({ checkoutService, bulkhead });

    const res = await request(app).post('/api/v1/checkout').send(PedidoCheckoutMother.valido());

    expect(res.status).toBe(503);
    expect(res.body.erro).toBe('Sistema sobrecarregado. Tente novamente em instantes.');
  });

  test('rejeita corpo acima do limite de 16kb com 413', async () => {
    const app = createApp({ checkoutService: { processar: jest.fn() } });
    const corpoGrande = JSON.stringify({ lixo: 'x'.repeat(20 * 1024) });

    const res = await request(app)
      .post('/api/v1/checkout')
      .set('Content-Type', 'application/json')
      .send(corpoGrande);

    expect(res.status).toBe(413);
  });
});
