const { Bulkhead, BulkheadCheioError } = require('../../../src/services/Bulkhead');

const adiar = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('Bulkhead', () => {
  test('executa ate o limite de concorrencia simultaneamente', async () => {
    const t1 = adiar();
    const t2 = adiar();
    const bulk = new Bulkhead({ maxConcurrent: 2, maxQueue: 0 });

    const p1 = bulk.executar(() => t1.promise);
    const p2 = bulk.executar(() => t2.promise);

    expect(bulk.emExecucaoAtual).toBe(2);

    t1.resolve('a');
    t2.resolve('b');
    await expect(p1).resolves.toBe('a');
    await expect(p2).resolves.toBe('b');
  });

  test('rejeita com BulkheadCheioError quando concorrencia e fila estao cheias', async () => {
    const t1 = adiar();
    const bulk = new Bulkhead({ maxConcurrent: 1, maxQueue: 0 });

    const p1 = bulk.executar(() => t1.promise);

    await expect(bulk.executar(() => Promise.resolve('x'))).rejects.toBeInstanceOf(BulkheadCheioError);

    t1.resolve('ok');
    await p1;
  });

  test('enfileira ate maxQueue e processa quando um slot libera', async () => {
    const t1 = adiar();
    const bulk = new Bulkhead({ maxConcurrent: 1, maxQueue: 1 });
    let executou2 = false;

    const p1 = bulk.executar(() => t1.promise);
    const p2 = bulk.executar(() => {
      executou2 = true;
      return Promise.resolve('2');
    });

    expect(bulk.naFila).toBe(1);
    expect(executou2).toBe(false);

    t1.resolve('1');
    await p1;
    await expect(p2).resolves.toBe('2');
    expect(executou2).toBe(true);
  });

  test('libera o slot mesmo quando a tarefa falha', async () => {
    const bulk = new Bulkhead({ maxConcurrent: 1, maxQueue: 0 });

    await expect(bulk.executar(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

    expect(bulk.emExecucaoAtual).toBe(0);
    await expect(bulk.executar(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  test('BulkheadCheioError carrega nome e mensagem descritivos', () => {
    const erro = new BulkheadCheioError();

    expect(erro.name).toBe('BulkheadCheioError');
    expect(erro.message).toContain('Bulkhead cheio');
  });
});
