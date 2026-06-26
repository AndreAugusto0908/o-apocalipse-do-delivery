class InMemoryCacheStore {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.mapa = new Map();
  }

  async get(chave) {
    const item = this.mapa.get(chave);

    if (!item) {
      return null;
    }

    if (item.expiraEm <= this.now()) {
      this.mapa.delete(chave);
      return null;
    }

    return item.valor;
  }

  async set(chave, valor, ttlMs) {
    this.mapa.set(chave, { valor, expiraEm: this.now() + ttlMs });
  }

  async flush() {
    this.mapa.clear();
  }
}

class CacheService {
  constructor({ store, ttlMs = 30000, jitterRatio = 0.2, random = Math.random } = {}) {
    this.store = store;
    this.ttlMs = ttlMs;
    this.jitterRatio = jitterRatio;
    this.random = random;
    this.emVoo = new Map();
  }

  async obter(chave, carregar) {
    const cacheado = await this._lerSeguro(chave);

    if (cacheado !== undefined && cacheado !== null) {
      return cacheado;
    }

    if (this.emVoo.has(chave)) {
      return this.emVoo.get(chave);
    }

    const promise = this._carregarEArmazenar(chave, carregar);
    this.emVoo.set(chave, promise);

    try {
      return await promise;
    } finally {
      this.emVoo.delete(chave);
    }
  }

  async flush() {
    try {
      await this.store.flush();
    } catch (error) {
      console.error('Cache indisponivel no flush:', error.message);
    }
  }

  async _lerSeguro(chave) {
    try {
      return await this.store.get(chave);
    } catch (error) {
      console.error('Cache indisponivel na leitura:', error.message);
      return null;
    }
  }

  async _carregarEArmazenar(chave, carregar) {
    const valor = await carregar();

    try {
      await this.store.set(chave, valor, this._ttlComJitter());
    } catch (error) {
      console.error('Cache indisponivel na escrita:', error.message);
    }

    return valor;
  }

  _ttlComJitter() {
    const jitter = this.random() * this.ttlMs * this.jitterRatio;
    return Math.round(this.ttlMs + jitter);
  }
}

class RedisCacheStore {
  constructor({ client }) {
    this.client = client;
  }

  async get(chave) {
    const bruto = await this.client.get(chave);

    if (bruto === null || bruto === undefined) {
      return null;
    }

    return JSON.parse(bruto);
  }

  async set(chave, valor, ttlMs) {
    await this.client.set(chave, JSON.stringify(valor), { PX: ttlMs });
  }

  async flush() {
    await this.client.flushDb();
  }
}

module.exports = { CacheService, InMemoryCacheStore, RedisCacheStore };
