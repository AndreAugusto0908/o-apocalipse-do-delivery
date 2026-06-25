const request = require('supertest');
const { createApp, startServer } = require('../../../src/server');
const { CheckoutServiceMock } = require('../../support/ServerTestSupport');

describe('Rotas operacionais', () => {
  test('expoe rota para limpeza de cache', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const app = createApp({ checkoutService: CheckoutServiceMock.naoDeveSerChamado() });

    const resposta = await request(app).post('/api/v1/cache/flush').send({});

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ status: 'cache_invalidated' });
    expect(console.log).toHaveBeenCalledWith('CACHE LIMPO ABRUPTAMENTE!');

    console.log.mockRestore();
  });
});

describe('Bootstrap HTTP', () => {
  test('startServer inicializa e retorna um servidor fechavel', (done) => {
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const server = startServer(0);

    server.on('listening', () => {
      expect(server.listening).toBe(true);
      expect(console.log).toHaveBeenCalledWith('Servidor da EntregasJa rodando na porta 0');
      server.close(() => {
        console.log.mockRestore();
        done();
      });
    });
  });
});

