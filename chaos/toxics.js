// Injetor de "toxicos" no Toxiproxy para os experimentos de caos da Fase 4.
// Uso: node chaos/toxics.js <comando>
//   gateway-slow   -> adiciona 5000ms de latencia na API de pagamento
//   gateway-reset  -> remove a latencia do gateway
//   cache-down     -> derruba o no de cache (desabilita o proxy do Redis)
//   cache-up       -> religa o no de cache
//   reset-all      -> remove todos os toxicos e religa tudo
//
// Variaveis: TOXIPROXY_URL (default http://localhost:8474)
//            GATEWAY_LATENCY_MS (default 5000)

const TOXIPROXY_URL = process.env.TOXIPROXY_URL || 'http://localhost:8474';
const LATENCIA_MS = Number(process.env.GATEWAY_LATENCY_MS || 5000);

const chamar = async (metodo, caminho, corpo) => {
  const resposta = await fetch(`${TOXIPROXY_URL}${caminho}`, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined
  });

  if (!resposta.ok && resposta.status !== 404 && resposta.status !== 409) {
    const texto = await resposta.text();
    throw new Error(`Toxiproxy ${metodo} ${caminho} -> ${resposta.status}: ${texto}`);
  }

  return resposta.status;
};

const definirProxyHabilitado = (proxy, enabled) =>
  chamar('POST', `/proxies/${proxy}`, { enabled });

const adicionarLatencia = (proxy, nome, latency) =>
  chamar('POST', `/proxies/${proxy}/toxics`, {
    name: nome,
    type: 'latency',
    stream: 'upstream',
    attributes: { latency, jitter: 0 }
  });

const removerToxic = (proxy, nome) => chamar('DELETE', `/proxies/${proxy}/toxics/${nome}`);

const comandos = {
  'gateway-slow': async () => {
    await removerToxic('gateway', 'latency_gateway').catch(() => {});
    await adicionarLatencia('gateway', 'latency_gateway', LATENCIA_MS);
    console.log(`[caos] Gateway lento: +${LATENCIA_MS}ms de latencia injetados via Toxiproxy.`);
  },
  'gateway-reset': async () => {
    await removerToxic('gateway', 'latency_gateway').catch(() => {});
    console.log('[caos] Latencia do gateway removida.');
  },
  'cache-down': async () => {
    await definirProxyHabilitado('redis', false);
    console.log('[caos] No de cache (Redis) derrubado via Toxiproxy.');
  },
  'cache-up': async () => {
    await definirProxyHabilitado('redis', true);
    console.log('[caos] No de cache (Redis) religado.');
  },
  'reset-all': async () => {
    await removerToxic('gateway', 'latency_gateway').catch(() => {});
    await definirProxyHabilitado('redis', true);
    console.log('[caos] Todos os toxicos removidos; proxies religados.');
  }
};

const comando = process.argv[2];

if (!comando || !comandos[comando]) {
  console.error(`Comando invalido. Use um de: ${Object.keys(comandos).join(', ')}`);
  process.exit(1);
}

comandos[comando]().catch((erro) => {
  console.error('Falha ao aplicar toxico:', erro.message);
  process.exit(1);
});
