import http from 'k6/http';

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 599 }));
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const gatewaySlowErrors = new Rate('gateway_slow_errors');

export const options = {
  scenarios: {
    gateway_lento_5000ms: {
      executor: 'ramping-vus',
      stages: [
        { duration: '15s', target: 10 },
        { duration: '30s', target: 10 },
        { duration: '15s', target: 0 }
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

  const ok = check(response, {
    'gateway lento aciona fallback controlado': (res) => res.status === 500,
    'mensagem amigavel no fallback': (res) => (
      res.json('erro') === 'Nao foi possivel processar seu pagamento. Tente mais tarde.'
    ),
    'fallback responde antes de 5s': (res) => res.timings.duration < 5000
  });

  gatewaySlowErrors.add(!ok);
  sleep(0.5);
}

