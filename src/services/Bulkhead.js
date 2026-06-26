class BulkheadCheioError extends Error {
  constructor(message = 'Bulkhead cheio: limite de concorrencia atingido') {
    super(message);
    this.name = 'BulkheadCheioError';
  }
}

class Bulkhead {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 10;
    this.maxQueue = options.maxQueue ?? 0;
    this.emExecucao = 0;
    this.fila = [];
  }

  get emExecucaoAtual() {
    return this.emExecucao;
  }

  get naFila() {
    return this.fila.length;
  }

  async executar(fn) {
    if (this.emExecucao >= this.maxConcurrent) {
      if (this.fila.length >= this.maxQueue) {
        throw new BulkheadCheioError();
      }

      await new Promise((resolve) => this.fila.push(resolve));
    }

    this.emExecucao += 1;

    try {
      return await fn();
    } finally {
      this.emExecucao -= 1;
      this._liberarProximo();
    }
  }

  _liberarProximo() {
    const proximo = this.fila.shift();

    if (proximo) {
      proximo();
    }
  }
}

module.exports = { Bulkhead, BulkheadCheioError };
