# Testes de desempenho - Fase 4 SRE

Esta pasta contem scripts k6 para validar o checkout em um ambiente de homologacao simulado, usando volumetria inspirada em Black Friday.

## SLI/SLO definidos

| Indicador | SLI medido | SLO obrigatorio |
| :--- | :--- | :--- |
| Latencia | `http_req_duration` no percentil 95 | `p95 < 5000 ms` |
| Erro HTTP | `http_req_failed` | taxa de erro `< 5%` |
| Erro funcional do checkout | `checkout_errors` | taxa de erro `< 5%` |

## Scripts

| Script | Objetivo | Perfil |
| :--- | :--- | :--- |
| `black-friday-load.js` | Teste de carga nominal | ramp-up para 25 VUs, steady de 1 minuto, ramp-down |
| `black-friday-stress.js` | Teste de estresse progressivo | ramp-up ate 100 VUs para observar degradacao |

## Como executar

Em um terminal, suba a aplicacao:

```bash
npm start
```

Em outro terminal, execute o teste desejado:

```bash
npm run perf:load
npm run perf:stress
```

Para apontar para outro ambiente:

```bash
BASE_URL=http://localhost:3000 npm run perf:load
```

No PowerShell:

```powershell
$env:BASE_URL='http://localhost:3000'; npm run perf:load
```

A execucao falha automaticamente se qualquer threshold de SLO for violado.

## Injecao de falha: Thundering Herd apos flush de cache

O script `thundering-herd-cache-flush.js` simula o desastre de **Thundering Herd**:

1. executa `POST /api/v1/cache/flush` para invalidar o cache;
2. dispara uma manada de checkouts simultaneos;
3. valida se a aplicacao permanece dentro dos SLOs de latencia e erro.

Por padrao, o script usa **10.000 VUs**, cada um executando uma requisicao de checkout:

```bash
npm run perf:herd
```

Para uma rodada local menor:

```powershell
npm run perf:herd:local
```

SLIs/SLOs do desastre:

| Indicador | SLI medido | SLO |
| :--- | :--- | :--- |
| Latencia p95 | `http_req_duration` | `< 5000 ms` |
| Erro HTTP | `http_req_failed` | `< 5%` |
| Erro funcional do checkout | `checkout_errors` | `< 5%` |
| Erro do flush de cache | `cache_flush_errors` | `< 1%` |

A protecao contra efeito cascata no codigo fica no `CheckoutService`: retry limitado, timeout curto, circuit breaker, fallback controlado e backoff exponencial com jitter entre tentativas de gateway.

Para sobrescrever manualmente com k6 direto:

`ash
k6 run -e HERD_VUS=500 tests/performance/thundering-herd-cache-flush.js
` 



## Injecao de falha: Gateway lento com 5000 ms

O script `gateway-lento-5000ms.js` valida o comportamento quando a API de pagamento parceira passa a responder com 5000 ms de latencia.

Para simular a falha, suba a aplicacao com a variavel de ambiente:

```powershell
$env:GATEWAY_LATENCY_MS='5000'; $env:CHECKOUT_TIMEOUT_MS='1000'; $env:CHECKOUT_MAX_RETRIES='1'; $env:CHECKOUT_RETRY_DELAY_MS='100'; npm start
```

Em outro terminal, execute:

```bash
npm run perf:gateway-slow
```

SLOs do desastre:

| Indicador | SLI medido | SLO |
| :--- | :--- | :--- |
| Fallback controlado | HTTP 500 com mensagem amigavel | erro funcional `< 5%` |
| Latencia p95 | `http_req_duration` | `< 5000 ms` |
| Erro HTTP de transporte | `http_req_failed` | `< 5%` |

Como o `CheckoutService` possui timeout de 2000 ms e retry limitado, o resultado esperado nao e aguardar os 5000 ms do gateway, mas sim acionar fallback controlado antes do limite de 5 segundos.

Evidencia local obtida:

```text
p95 = 2.14 s
http_req_failed = 0.00%
gateway_slow_errors = 0.00%
```
