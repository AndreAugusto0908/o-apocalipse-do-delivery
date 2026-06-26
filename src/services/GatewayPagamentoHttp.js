// Cliente HTTP do gateway de pagamento.
// Em homologacao, as chamadas passam por um proxy Toxiproxy, que injeta
// latencia/queda na rede sem alterar o codigo da aplicacao.
class GatewayPagamentoHttp {
  constructor({ baseUrl, fetchImpl = fetch, timeoutMs = 3000 }) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;

    // PCI: dados de cartao em transito exigem TLS em producao. O http:// e
    // aceito apenas para o ambiente simulado (Toxiproxy/rede interna do compose).
    if (process.env.NODE_ENV === 'production' && baseUrl && baseUrl.startsWith('http://')) {
      console.warn('GatewayPagamentoHttp: GATEWAY_URL sem TLS em producao - use https para proteger dados de cartao.');
    }
  }

  async cobrar(valor, cartao, idempotencyKey) {
    // AbortController garante que um gateway lento/pendurado tenha o socket
    // efetivamente fechado no timeout, evitando exaustao de conexoes sob carga.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resposta = await this.fetchImpl(`${this.baseUrl}/cobrar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey ?? ''
        },
        body: JSON.stringify({ valor, cartao }),
        signal: controller.signal
      });

      if (!resposta.ok) {
        throw new Error(`GATEWAY_HTTP_${resposta.status}`);
      }

      return await resposta.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('GATEWAY_TIMEOUT');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { GatewayPagamentoHttp };
