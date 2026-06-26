const { RedisCacheStore } = require('../../../src/services/CacheService');

describe('RedisCacheStore', () => {
  test('get desserializa o JSON armazenado no Redis', async () => {
    const client = { get: jest.fn().mockResolvedValue('{"loja":"ok"}') };
    const store = new RedisCacheStore({ client });

    expect(await store.get('k')).toEqual({ loja: 'ok' });
  });

  test('get retorna null quando a chave nao existe', async () => {
    const client = { get: jest.fn().mockResolvedValue(null) };
    const store = new RedisCacheStore({ client });

    expect(await store.get('k')).toBeNull();
  });

  test('get retorna null quando o client devolve undefined', async () => {
    const client = { get: jest.fn().mockResolvedValue(undefined) };
    const store = new RedisCacheStore({ client });

    expect(await store.get('k')).toBeNull();
  });

  test('set grava JSON com expiracao em milissegundos (PX)', async () => {
    const client = { set: jest.fn().mockResolvedValue('OK') };
    const store = new RedisCacheStore({ client });

    await store.set('k', { loja: 'ok' }, 1500);

    expect(client.set).toHaveBeenCalledWith('k', '{"loja":"ok"}', { PX: 1500 });
  });

  test('flush chama flushDb no client', async () => {
    const client = { flushDb: jest.fn().mockResolvedValue('OK') };
    const store = new RedisCacheStore({ client });

    await store.flush();

    expect(client.flushDb).toHaveBeenCalledTimes(1);
  });
});
