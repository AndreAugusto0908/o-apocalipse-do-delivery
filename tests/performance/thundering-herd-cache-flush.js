import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import { gerarHandleSummary } from './lib/summary.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const HERD_VUS = Number(__ENV.HERD_VUS || 10000);
const checkoutErrors = new Rate('checkout_errors');
const cacheFlushErrors = new Rate('cache_flush_errors');

export const options = {
  scenarios: {
    thundering_herd_after_cache_flush: {
      executor: 'per-vu-iterations',
      vus: HERD_VUS,
      iterations: 1,
      maxDuration: '2m'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.05'],
    checkout_errors: ['rate<0.05'],
    cache_flush_errors: ['rate<0.01']
  },
  summaryTrendStats: ['min', 'avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

export function setup() {
  // Invalida o cache de verdade (FLUSHDB no Redis) imediatamente antes da manada.
  const response = http.post(`${BASE_URL}/api/v1/cache/flush`, null, {
    tags: { endpoint: 'cache-flush' }
  });

  const ok = check(response, {
    'cache flush executado antes da manada': (res) => res.status === 200,
    'cache flush retorna contrato esperado': (res) => res.json('status') === 'cache_invalidated'
  });

  cacheFlushErrors.add(!ok);
}

export default function () {
  const payload = JSON.stringify({
    clienteEmail: `herd-${__VU}@entregasja.com`,
    valor: 199.9,
    cartao: {
      numero: '4111111111111111',
      validade: '12/30',
      cvv: '123'
    }
  });

  const response = http.post(`${BASE_URL}/api/v1/checkout`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'checkout-after-cache-flush' }
  });

  // Sobreviver ao herd depende do single-flight no cache (uma so leitura ao
  // banco) + backoff com jitter no gateway (retentativas nao voltam juntas).
  const ok = check(response, {
    'checkout sobrevive ao thundering herd': (res) => res.status === 200,
    'checkout herd abaixo de 5s': (res) => res.timings.duration < 5000
  });

  checkoutErrors.add(!ok);
}

export const handleSummary = gerarHandleSummary('thundering-herd-cache-flush');
