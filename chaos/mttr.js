// Mede o MTTR (Mean Time To Recovery) do checkout sob caos.
//
// Fluxo do experimento:
//   1. Estabiliza a linha de base (respostas rapidas e 200).
//   2. Injeta uma falha via Toxiproxy (gateway lento OU queda de cache).
//   3. Mede o tempo ate DETECTAR a degradacao (MTTD).
//   4. Remove a falha.
//   5. Mede o tempo ate a RECUPERACAO (MTTR) = servico saudavel de novo.
//   6. Grava docs/evidencias/mttr-<falha>.json.
//
// Uso: node chaos/mttr.js [gateway-slow|cache-down]
// Variaveis: BASE_URL (http://localhost:3000), HEALTHY_MS (1500),
//            POLL_MS (500), AMOSTRAS_SAUDAVEIS (5)
const { execFileSync } = require('child_process');
const { writeFileSync, mkdirSync } = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const HEALTHY_MS = Number(process.env.HEALTHY_MS || 1500);
const POLL_MS = Number(process.env.POLL_MS || 500);
const AMOSTRAS_SAUDAVEIS = Number(process.env.AMOSTRAS_SAUDAVEIS || 5);

const FALHAS = {
  'gateway-slow': { injetar: 'gateway-slow', remover: 'gateway-reset' },
  'cache-down': { injetar: 'cache-down', remover: 'cache-up' }
};

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const aplicarToxico = (comando) =>
  execFileSync('node', ['chaos/toxics.js', comando], { stdio: 'inherit' });

const pedidoExemplo = () => JSON.stringify({
  clienteEmail: `mttr-${Date.now()}@entregasja.com`,
  valor: 99.9,
  cartao: { numero: '4111111111111111', validade: '12/30', cvv: '123' }
});

const amostrar = async () => {
  const inicio = Date.now();
  try {
    const resposta = await fetch(`${BASE_URL}/api/v1/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: pedidoExemplo()
    });
    const ms = Date.now() - inicio;
    return { saudavel: resposta.status === 200 && ms < HEALTHY_MS, status: resposta.status, ms };
  } catch (erro) {
    return { saudavel: false, status: 0, ms: Date.now() - inicio, erro: erro.message };
  }
};

const aguardarSaudavel = async () => {
  let consecutivas = 0;
  while (consecutivas < AMOSTRAS_SAUDAVEIS) {
    const amostra = await amostrar();
    consecutivas = amostra.saudavel ? consecutivas + 1 : 0;
    await dormir(POLL_MS);
  }
};

const aguardarDegradacao = async () => {
  for (;;) {
    const amostra = await amostrar();
    if (!amostra.saudavel) {
      return amostra;
    }
    await dormir(POLL_MS);
  }
};

const executar = async () => {
  const tipo = process.argv[2] || 'gateway-slow';
  const falha = FALHAS[tipo];

  if (!falha) {
    console.error(`Falha invalida. Use: ${Object.keys(FALHAS).join(' | ')}`);
    process.exit(1);
  }

  console.log(`[MTTR] Estabilizando linha de base em ${BASE_URL}...`);
  await aguardarSaudavel();

  console.log(`[MTTR] Injetando falha: ${tipo}`);
  const tInjecao = Date.now();
  aplicarToxico(falha.injetar);

  const degradacao = await aguardarDegradacao();
  const tDeteccao = Date.now();
  const mttd = tDeteccao - tInjecao;
  console.log(`[MTTR] Degradacao detectada em ${mttd}ms (status ${degradacao.status}, ${degradacao.ms}ms)`);

  // Observa a degradacao por um instante antes de remediar.
  await dormir(2000);

  console.log('[MTTR] Removendo a falha e medindo a recuperacao...');
  const tRemediacao = Date.now();
  aplicarToxico(falha.remover);

  await aguardarSaudavel();
  const tRecuperado = Date.now();

  const relatorio = {
    falha: tipo,
    mttd_ms: mttd,
    mttr_ms: tRecuperado - tRemediacao,
    downtime_total_ms: tRecuperado - tDeteccao,
    sloHealthyMs: HEALTHY_MS,
    medidoEm: new Date().toISOString()
  };

  mkdirSync('docs/evidencias', { recursive: true });
  writeFileSync(`docs/evidencias/mttr-${tipo}.json`, JSON.stringify(relatorio, null, 2));

  console.log('[MTTR] Resultado:', JSON.stringify(relatorio, null, 2));
  console.log(`[MTTR] Evidencia salva em docs/evidencias/mttr-${tipo}.json`);
};

executar().catch((erro) => {
  console.error('[MTTR] Experimento falhou:', erro.message);
  process.exit(1);
});
