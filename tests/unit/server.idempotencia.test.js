const { criarPedidoCheckout, criarGatewayPagamentoMock } = require('../../src/server');

describe('server - idempotencia', () => {
  test('criarPedidoCheckout gera uma chave de idempotencia unica por pedido', () => {
    const dados = {
      clienteEmail: 'cliente@entregasja.com',
      valor: 50,
      cartao: { numero: '4111111111111111', validade: '12/30', cvv: '123' }
    };

    const p1 = criarPedidoCheckout(dados);
    const p2 = criarPedidoCheckout(dados);

    expect(typeof p1.idempotencyKey).toBe('string');
    expect(p1.idempotencyKey.length).toBeGreaterThan(0);
    expect(p1.idempotencyKey).not.toBe(p2.idempotencyKey);
  });

  test('o gateway mock e idempotente: a mesma chave nao cobra duas vezes', async () => {
    const gateway = criarGatewayPagamentoMock({ latencyMs: 0 });

    const r1 = await gateway.cobrar(100, {}, 'k1');
    const r2 = await gateway.cobrar(100, {}, 'k1');

    expect(r1).toEqual(r2);
    expect(gateway.cobrancasRealizadas).toBe(1);
  });
});
