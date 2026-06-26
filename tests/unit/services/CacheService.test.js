const { CacheService, InMemoryCacheStore } = require('../../../src/services/CacheService');

const adiar = () => {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const criarRelogio = (inicial = 0) => {
  let agora = inicial;
  const now = () => agora;
  now.avancar = (ms) => {
    agora += ms;
  };
  return now;
};

describe('InMemoryCacheStore', () => {
  test('expira itens pelo TTL', async () => {
    const relogio = criarRelogio();
    const store = new InMemoryCacheStore({ now: relogio });

    await store.set('k', 'v', 1000);
    expect(await store.get('k')).toBe('v');

    relogio.avancar(1000);
    expect(await store.get('k')).toBeNull();
  });
});

describe('CacheService', () => {
  test('cache miss carrega da fonte e cache hit nao recarrega', async () => {
    const cache = new CacheService({ store: new InMemoryCacheStore() });
    const fonte = jest.fn().mockResolvedValue({ preco: 10 });

    const v1 = await cache.obter('k', fonte);
    const v2 = await cache.obter('k', fonte);

    expect(v1).toEqual({ preco: 10 });
    expect(v2).toEqual({ preco: 10 });
    expect(fonte).toHaveBeenCalledTimes(1);
  });

  test('single-flight: chamadas concorrentes em cache vazio carregam a fonte uma unica vez', async () => {
    const cache = new CacheService({ store: new InMemoryCacheStore() });
    const adiado = adiar();
    const fonte = jest.fn(() => adiado.promise);

    const pendentes = [cache.obter('k', fonte), cache.obter('k', fonte), cache.obter('k', fonte)];
    adiado.resolve({ ok: true });
    const resultados = await Promise.all(pendentes);

    expect(fonte).toHaveBeenCalledTimes(1);
    expect(resultados).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
  });

  test('flush limpa o cache e forca recarga', async () => {
    const cache = new CacheService({ store: new InMemoryCacheStore() });
    const fonte = jest.fn().mockResolvedValue('v');

    await cache.obter('k', fonte);
    await cache.flush();
    await cache.obter('k', fonte);

    expect(fonte).toHaveBeenCalledTimes(2);
  });

  test('degrada graciosamente quando o store falha na leitura', async () => {
    const store = {
      get: jest.fn().mockRejectedValue(new Error('redis down')),
      set: jest.fn(),
      flush: jest.fn()
    };
    const cache = new CacheService({ store });
    const fonte = jest.fn().mockResolvedValue('fonte');

    const v = await cache.obter('k', fonte);

    expect(v).toBe('fonte');
    expect(fonte).toHaveBeenCalledTimes(1);
  });

  test('aplica TTL com jitter ao gravar no store', async () => {
    const store = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), flush: jest.fn() };
    const cache = new CacheService({ store, ttlMs: 1000, jitterRatio: 0.2, random: () => 1 });

    await cache.obter('k', jest.fn().mockResolvedValue('v'));

    expect(store.set).toHaveBeenCalledWith('k', 'v', 1200);
  });
});
