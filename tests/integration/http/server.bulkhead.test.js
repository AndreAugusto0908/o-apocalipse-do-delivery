const request = require('supertest');
const { createApp } = require('../../../src/server');
const { Bulkhead } = require('../../../src/services/Bulkhead');
const { PedidoCheckoutMother, CheckoutServiceMock } = require('../../support/ServerTestSupport');

describe('POST /api/v1/checkout - bulkhead / load shedding', () => {
  test('responde 503 quando o bulkhead esta saturado, sem chamar o checkout', async () => {
    const checkoutService = CheckoutServiceMock.processaComSucesso();
    const bulkhead = new Bulkhead({ maxConcurrent: 0, maxQueue: 0 });
    const app = createApp({ checkoutService, bulkhead });

    const res = await request(app).post('/api/v1/checkout').send(PedidoCheckoutMother.valido());

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('erro');
    expect(checkoutService.processar).not.toHaveBeenCalled();
  });

  test('processa normalmente quando ha capacidade disponivel', async () => {
    const checkoutService = CheckoutServiceMock.processaComSucesso();
    const bulkhead = new Bulkhead({ maxConcurrent: 5, maxQueue: 5 });
    const app = createApp({ checkoutService, bulkhead });

    const res = await request(app).post('/api/v1/checkout').send(PedidoCheckoutMother.valido());

    expect(res.status).toBe(200);
    expect(checkoutService.processar).toHaveBeenCalledTimes(1);
  });
});
