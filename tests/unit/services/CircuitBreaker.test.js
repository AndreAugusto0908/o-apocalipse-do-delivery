const { CircuitBreaker } = require('../../../src/services/CircuitBreaker');

const criarRelogio = (inicial = 0) => {
  let agora = inicial;
  const now = () => agora;
  now.avancar = (ms) => {
    agora += ms;
  };
  return now;
};

describe('CircuitBreaker', () => {
  test('comeca fechado e permite chamadas', () => {
    const cb = new CircuitBreaker();

    expect(cb.isOpen()).toBe(false);
    expect(cb.estadoAtual).toBe('FECHADO');
  });

  test('nao abre antes de atingir o volume minimo de requisicoes', () => {
    const cb = new CircuitBreaker({ minimumRequests: 5, threshold: 0.5 });

    cb.registrarFalha();
    cb.registrarFalha();

    expect(cb.isOpen()).toBe(false);
  });

  test('abre quando a taxa de falha ultrapassa 50% apos o volume minimo', () => {
    const cb = new CircuitBreaker({ minimumRequests: 4, threshold: 0.5 });

    cb.registrarFalha();
    cb.registrarFalha();
    cb.registrarFalha();
    cb.registrarSucesso();

    expect(cb.isOpen()).toBe(true);
    expect(cb.estadoAtual).toBe('ABERTO');
  });

  test('nao abre quando a taxa de falha fica em 50% ou menos', () => {
    const cb = new CircuitBreaker({ minimumRequests: 4, threshold: 0.5 });

    cb.registrarFalha();
    cb.registrarFalha();
    cb.registrarSucesso();
    cb.registrarSucesso();

    expect(cb.isOpen()).toBe(false);
  });

  test('permanece aberto antes de o cooldown expirar', () => {
    const relogio = criarRelogio();
    const cb = new CircuitBreaker({
      minimumRequests: 2, threshold: 0.5, resetTimeoutMs: 1000, now: relogio
    });

    cb.registrarFalha();
    cb.registrarFalha();
    relogio.avancar(999);

    expect(cb.isOpen()).toBe(true);
  });

  test('passa a meio-aberto e permite uma tentativa apos o cooldown', () => {
    const relogio = criarRelogio();
    const cb = new CircuitBreaker({
      minimumRequests: 2, threshold: 0.5, resetTimeoutMs: 1000, now: relogio
    });

    cb.registrarFalha();
    cb.registrarFalha();
    expect(cb.isOpen()).toBe(true);

    relogio.avancar(1000);

    expect(cb.isOpen()).toBe(false);
    expect(cb.estadoAtual).toBe('MEIO_ABERTO');
  });

  test('fecha novamente apos sucesso em meio-aberto', () => {
    const relogio = criarRelogio();
    const cb = new CircuitBreaker({
      minimumRequests: 2, threshold: 0.5, resetTimeoutMs: 1000, now: relogio
    });

    cb.registrarFalha();
    cb.registrarFalha();
    relogio.avancar(1000);
    cb.isOpen();

    cb.registrarSucesso();

    expect(cb.estadoAtual).toBe('FECHADO');
    expect(cb.isOpen()).toBe(false);
  });

  test('reabre apos falha em meio-aberto', () => {
    const relogio = criarRelogio();
    const cb = new CircuitBreaker({
      minimumRequests: 2, threshold: 0.5, resetTimeoutMs: 1000, now: relogio
    });

    cb.registrarFalha();
    cb.registrarFalha();
    relogio.avancar(1000);
    cb.isOpen();

    cb.registrarFalha();

    expect(cb.estadoAtual).toBe('ABERTO');
    expect(cb.isOpen()).toBe(true);
  });
});
