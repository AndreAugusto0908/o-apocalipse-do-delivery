// Cliente HTTP do gateway de pagamento.
// Em homologacao, as chamadas passam por um proxy Toxiproxy, que injeta
// latencia/queda na rede sem alterar o codigo da aplicacao.
class GatewayPagamentoHttp {
  constructor({ baseUrl, fetchImpl = fetch }) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
  }

  async cobrar(valor, cartao, idempotencyKey) {
    const resposta = await this.fetchImpl(`${this.baseUrl}/cobrar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey ?? ''
      },
      body: JSON.stringify({ valor, cartao })
    });

    if (!resposta.ok) {
      throw new Error(`GATEWAY_HTTP_${resposta.status}`);
    }

    return resposta.json();
  }
}

module.exports = { GatewayPagamentoHttp };
