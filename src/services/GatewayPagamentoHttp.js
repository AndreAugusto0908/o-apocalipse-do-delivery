// Cliente HTTP do gateway de pagamento.
// Em homologacao, as chamadas passam por um proxy Toxiproxy, que injeta
// latencia/queda na rede sem alterar o codigo da aplicacao.
//
// PCI/seguranca: dados de cartao em transito EXIGEM TLS. Em producao, GATEWAY_URL
// deve usar https://. O http:// e aceito apenas no ambiente simulado (rede
// interna do docker-compose via Toxiproxy). Ver secao de seguranca no README.
class GatewayPagamentoHttp {
  constructor({ baseUrl, fetchImpl = fetch, timeoutMs = 3000 }) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
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
