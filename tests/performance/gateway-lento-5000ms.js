import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { gerarHandleSummary } from './lib/summary.js';

// A latencia de 5000ms NAO e simulada no codigo: ela e injetada na REDE pelo
// Toxiproxy (npm run chaos:gateway-slow) antes/durante esta execucao.
// Aqui sao tratados como "esperados" apenas o 200 (sucesso) e o 500 (fallback
// controlado). 502/503/504/timeout de transporte contam como http_req_failed,
// para que o threshold realmente detecte colapso (e nao seja neutralizado).
http.setResponseCallback(http.expectedStatuses(200, 500));

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const GATEWAY_VUS = Number(__ENV.GATEWAY_VUS || 50);
const gatewaySlowErrors = new Rate('gateway_slow_errors');
const fallbackControlado = new Rate('fallback_controlado');

export const options = {
  scenarios: {
    gateway_lento_5000ms: {
      executor: 'ramping-vus',
      stages: [
        { duration: '20s', target: GATEWAY_VUS },
        { duration: '1m', target: GATEWAY_VUS },
        { duration: '20s', target: 0 }
      ],
      gracefulRampDown: '10s'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.05'],
    gateway_slow_errors: ['rate<0.05']
  },
  summaryTrendStats: ['min', 'avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

export default function () {
  const payload = JSON.stringify({
    clienteEmail: `gateway-lento-${__VU}-${__ITER}@entregasja.com`,
    valor: 89.9,
    cartao: {
      numero: '4111111111111111',
      validade: '12/30',
      cvv: '123'
    }
  });

  const response = http.post(`${BASE_URL}/api/v1/checkout`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'checkout-gateway-lento' }
  });

  // Comportamento resiliente esperado: ou sucesso (200) ou fallback rapido (500),
  // sempre antes de 5s, nunca pendurando os 5000ms do gateway.
  const respostaValida = response.status === 200 || response.status === 500;
  const ok = check(response, {
    'resposta resiliente (200 ou fallback 500)': () => respostaValida,
    'responde antes de 5s (nao espera o gateway)': (res) => res.timings.duration < 5000
  });

  fallbackControlado.add(response.status === 500);
  gatewaySlowErrors.add(!ok);
  sleep(0.5);
}

export const handleSummary = gerarHandleSummary('gateway-lento-5000ms');
