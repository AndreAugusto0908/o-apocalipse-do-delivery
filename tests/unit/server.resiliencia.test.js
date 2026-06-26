const {
  criarCheckoutServicePadrao,
  criarCircuitBreakerPadrao
} = require('../../src/server');
const { CircuitBreaker } = require('../../src/services/CircuitBreaker');

describe('server - wiring de resiliencia', () => {
  test('cria um circuit breaker padrao fechado', () => {
    const cb = criarCircuitBreakerPadrao();

    expect(cb).toBeInstanceOf(CircuitBreaker);
    expect(cb.isOpen()).toBe(false);
  });

  test('o checkout service padrao usa um circuit breaker real em producao', () => {
    const service = criarCheckoutServicePadrao();

    expect(service.circuitBreaker).toBeInstanceOf(CircuitBreaker);
  });
});
