import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { gerarHandleSummary } from './lib/summary.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const STRESS_VUS = Number(__ENV.STRESS_VUS || 500);

const checkoutErrors = new Rate('checkout_errors');

export const options = {
  scenarios: {
    black_friday_checkout_stress: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: Math.round(STRESS_VUS * 0.25) },
        { duration: '30s', target: Math.round(STRESS_VUS * 0.5) },
        { duration: '1m', target: Math.round(STRESS_VUS * 0.75) },
        { duration: '1m', target: STRESS_VUS },
        { duration: '30s', target: 0 }
      ],
      gracefulRampDown: '15s'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.05'],
    checkout_errors: ['rate<0.05']
  },
  summaryTrendStats: ['min', 'avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

export default function () {
  const payload = JSON.stringify({
    clienteEmail: `stress-${__VU}-${__ITER}@entregasja.com`,
    valor: 149.9,
    cartao: {
      numero: '4111111111111111',
      validade: '12/30',
      cvv: '123'
    }
  });

  const response = http.post(`${BASE_URL}/api/v1/checkout`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'checkout' }
  });

  const ok = check(response, {
    'checkout retorna 200 sob estresse': (res) => res.status === 200,
    'latencia individual abaixo de 5s': (res) => res.timings.duration < 5000
  });

  checkoutErrors.add(!ok);
  sleep(0.5);
}

export const handleSummary = gerarHandleSummary('black-friday-stress');
