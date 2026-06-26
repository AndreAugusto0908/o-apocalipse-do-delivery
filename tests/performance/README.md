# Testes de desempenho e caos - Fase 4 SRE

Scripts k6 + injecao de falhas via **Toxiproxy** para validar o checkout em um
ambiente de homologacao realista (`docker-compose`), com volumetria inspirada na
Black Friday.

## SLI/SLO

| Indicador | SLI medido | SLO |
| :--- | :--- | :--- |
| Latencia p95 | `http_req_duration` p(95) | `< 5000 ms` |
| Erro HTTP de transporte/colapso | `http_req_failed` | `< 5%` |
| Erro funcional do checkout | `checkout_errors` | `< 5%` |
| Erro do flush de cache | `cache_flush_errors` | `< 1%` |

> Os SLOs sao `thresholds` reais do k6: se violados, a execucao retorna codigo
> de saida diferente de zero e falha o pipeline.

## Scripts e volumetria (parametrizavel por ambiente)

| Script | Objetivo | Volumetria padrao | Variavel |
| :--- | :--- | :--- | :--- |
| `black-friday-load.js` | Carga nominal | ramp ate 200 VUs, 2 min steady | `LOAD_VUS` |
| `black-friday-stress.js` | Estresse progressivo | ramp ate 500 VUs | `STRESS_VUS` |
| `gateway-lento-5000ms.js` | Gateway lento (resiliencia) | 50 VUs | `GATEWAY_VUS` |
| `thundering-herd-cache-flush.js` | Manada apos flush de cache | 10.000 VUs | `HERD_VUS` |

Cada script gera evidencia commitavel em `docs/evidencias/k6/<nome>.summary.{json,txt}`
via `handleSummary`.

## Subir o ambiente de caos

```bash
npm run chaos:up        # docker compose: app + Toxiproxy + Redis + gateway-stub
```

A aplicacao fala com o gateway e com o Redis **sempre atraves do Toxiproxy**, o
que permite injetar latencia/queda na rede sem alterar o codigo:

```
app ──> toxiproxy:8666 ──> gateway-stub   (proxy "gateway")
app ──> toxiproxy:6669 ──> redis          (proxy "redis")
```

## Cenarios de caso de uso

### 1. Carga / estresse nominal

```bash
npm run perf:load
npm run perf:stress
```

### 2. Gateway lento (5000 ms) — degradacao graciosa

A latencia NAO e simulada no codigo: e injetada na rede pelo Toxiproxy.

```bash
npm run chaos:gateway-slow   # injeta +5000ms na chamada do gateway
npm run perf:gateway-slow    # k6 mede o comportamento
npm run chaos:gateway-reset  # remove a latencia
```

Esperado: o checkout nao espera os 5000 ms. Com timeout (2000 ms), retry
limitado, circuit breaker e fallback, responde 200 (sucesso) ou 500 (fallback
controlado) sempre abaixo de 5 s. Apenas 502/503/504/timeout de transporte
contam como `http_req_failed`.

### 3. Thundering Herd — flush de cache + manada

```bash
npm run perf:herd        # 10.000 VUs; faz FLUSHDB real e dispara a manada
npm run perf:herd:local  # rodada local reduzida (100 VUs)
```

Tambem e possivel derrubar o no de cache pela rede:

```bash
npm run chaos:cache-down  # desabilita o proxy do Redis (no de cache "cai")
npm run chaos:cache-up    # religa
```

Sobrevivencia garantida por: **single-flight** no cache (uma so leitura ao banco
por chave) + **backoff exponencial com jitter** no gateway (as retentativas nao
voltam todas ao mesmo tempo) + degradacao graciosa quando o Redis cai.

### 4. MTTR (Mean Time To Recovery)

```bash
npm run chaos:mttr        # gateway lento: injeta, detecta, remove, mede recuperacao
npm run chaos:mttr:cache  # mesmo experimento para a queda de cache
```

Gera `docs/evidencias/mttr-<falha>.json` com `mttd_ms`, `mttr_ms` e
`downtime_total_ms`.

## Resetar

```bash
npm run chaos:reset   # remove todos os toxicos e religa os proxies
npm run chaos:down    # derruba o ambiente
```
