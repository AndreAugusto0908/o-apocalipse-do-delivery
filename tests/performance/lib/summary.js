// Helper de relatorio para os cenarios k6.
// Gera um resumo de texto no stdout e grava artefatos commitaveis em
// docs/evidencias/k6/<nome>.summary.{json,txt} para servir de evidencia.

const arred = (valor) => (typeof valor === 'number' ? Math.round(valor * 100) / 100 : null);

const extrairMetricas = (data) => {
  const m = data.metrics || {};
  const dur = (m.http_req_duration && m.http_req_duration.values) || {};
  const falhas = (m.http_req_failed && m.http_req_failed.values) || {};
  const checks = (m.checks && m.checks.values) || {};

  const customizadas = {};
  ['checkout_errors', 'gateway_slow_errors', 'cache_flush_errors', 'fallback_controlado'].forEach((chave) => {
    if (m[chave] && m[chave].values) {
      customizadas[chave] = arred(m[chave].values.rate);
    }
  });

  return {
    p95_ms: arred(dur['p(95)']),
    p99_ms: arred(dur['p(99)']),
    avg_ms: arred(dur.avg),
    max_ms: arred(dur.max),
    http_req_failed_rate: arred(falhas.rate),
    checks_rate: arred(checks.rate),
    ...customizadas
  };
};

const montarTexto = (nome, metricas) => {
  const linhas = [
    `=== Cenario k6: ${nome} ===`,
    `p95 latencia:        ${metricas.p95_ms} ms (SLO < 5000 ms)`,
    `p99 latencia:        ${metricas.p99_ms} ms`,
    `latencia media:      ${metricas.avg_ms} ms`,
    `http_req_failed:     ${metricas.http_req_failed_rate} (SLO < 0.05)`,
    `checks aprovados:    ${metricas.checks_rate}`
  ];

  ['checkout_errors', 'gateway_slow_errors', 'cache_flush_errors', 'fallback_controlado'].forEach((chave) => {
    if (metricas[chave] !== undefined) {
      linhas.push(`${chave}: ${metricas[chave]}`);
    }
  });

  return `${linhas.join('\n')}\n`;
};

export function gerarHandleSummary(nome) {
  return (data) => {
    const metricas = extrairMetricas(data);
    const texto = montarTexto(nome, metricas);

    return {
      stdout: `\n${texto}`,
      [`docs/evidencias/k6/${nome}.summary.json`]: JSON.stringify(metricas, null, 2),
      [`docs/evidencias/k6/${nome}.summary.txt`]: texto
    };
  };
}
