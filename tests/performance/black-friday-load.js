import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { gerarHandleSummary } from './lib/summary.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const LOAD_VUS = Number(__ENV.LOAD_VUS || 200);
const checkoutErrors = new Rate('checkout_errors');

export const options = {
  scenarios: {
    black_friday_checkout_load: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: LOAD_VUS },
        { duration: '2m', target: LOAD_VUS },
        { duration: '30s', target: 0 }
      ],
      gracefulRampDown: '10s'
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
    clienteEmail: `cliente-${__VU}-${__ITER}@entregasja.com`,
    valor: 99.9,
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
    'checkout retorna 200': (res) => res.status === 200,
    'mensagem de sucesso presente': (res) => res.json('mensagem') === 'Pedido finalizado com sucesso!'
  });

  checkoutErrors.add(!ok);
  sleep(1);
}

export const handleSummary = gerarHandleSummary('black-friday-load');
