const request = require('supertest');
const { createApp } = require('../../../src/server');
const { CacheService, InMemoryCacheStore } = require('../../../src/services/CacheService');
const { PedidoCheckoutMother, CheckoutServiceMock } = require('../../support/ServerTestSupport');

const montarApp = () => {
  const carregarCatalogo = jest.fn().mockResolvedValue({ loja: 'aberta' });
  const cacheService = new CacheService({ store: new InMemoryCacheStore() });
  const app = createApp({
    checkoutService: CheckoutServiceMock.processaComSucesso(),
    cacheService,
    carregarCatalogo
  });
  return { app, carregarCatalogo };
};

describe('POST /api/v1/checkout - cache read-through', () => {
  test('consulta a fonte do catalogo uma unica vez em requisicoes repetidas (cache quente)', async () => {
    const { app, carregarCatalogo } = montarApp();

    await request(app).post('/api/v1/checkout').send(PedidoCheckoutMother.valido());
    await request(app).post('/api/v1/checkout').send(PedidoCheckoutMother.valido());

    expect(carregarCatalogo).toHaveBeenCalledTimes(1);
  });

  test('flush do cache forca recarregar o catalogo na proxima requisicao', async () => {
    const { app, carregarCatalogo } = montarApp();

    await request(app).post('/api/v1/checkout').send(PedidoCheckoutMother.valido());
    await request(app).post('/api/v1/cache/flush').send({});
    await request(app).post('/api/v1/checkout').send(PedidoCheckoutMother.valido());

    expect(carregarCatalogo).toHaveBeenCalledTimes(2);
  });
});
