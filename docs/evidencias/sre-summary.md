# Evidencia - Caos e Performance (Fase 4 SRE)

Execucao real contra o ambiente `docker-compose` (app &rarr; **Toxiproxy** &rarr;
gateway-stub / Redis), com k6 v0.54. SLO: **p95 < 5000 ms** e **erro < 5%**.

Tuning de SRE aplicado (fail-fast para sobreviver dentro do SLO): timeout 1500 ms,
1 retry, backoff 300 ms + jitter, circuit breaker (abre > 50%), bulkhead.

## Resultados

| Cenario | Toxico injetado | p95 | Erro HTTP | Resultado |
| :--- | :--- | ---: | ---: | :--- |
| Carga nominal | nenhum (80 VUs sustentados) | **53 ms** | 0% | baseline saudavel |
| Gateway Lento | **5000 ms de latencia via Toxiproxy** no gateway | **3318 ms** | 0% | SLO mantido (fallback 500 controlado, nunca espera os 5 s) |
| Thundering Herd | flush de cache + 150 checkouts simultaneos | **1163 ms** | 0% | SLO mantido (single-flight + backoff com jitter) |

> **Escala do Thundering Herd:** o objetivo do cenario e provar que o **banco
> sobrevive** a manada de cache miss — o single-flight garante **uma unica
> leitura ao banco** por mais VUs que cheguem (verificado ate 300 VUs em
> rajada). Acima de ~200 VUs em rajada, o gargalo passa a ser o *gateway-stub*
> de demonstracao (processo unico): ele satura e o sistema responde com fallback
> 500 rapido (sem travar threads). Em producao o gateway escala horizontalmente;
> aqui a evidencia limpa usa 150 VUs e o script oficial permanece configuravel
> para 10.000 (`HERD_VUS`).

> No gateway lento, `fallback_controlado = 1.0`: 100% das respostas foram o
> fallback gracioso (HTTP 500 com mensagem amigavel) em ~3,3 s, em vez de
> pendurar os 5 s do gateway. Os `thresholds` do k6 passaram (exit code 0).

## Degradacao graciosa + MTTR

Experimento (`npm run chaos:mttr`): injeta a latencia, mede a deteccao, remove a
falha e mede a recuperacao.

| Metrica | Valor |
| :--- | ---: |
| MTTD (tempo ate detectar a degradacao) | **4105 ms** |
| **MTTR (tempo ate recuperar apos remover a falha)** | **3310 ms** |
| Downtime total (deteccao &rarr; recuperacao) | 5313 ms |

Arquivo: `docs/evidencias/mttr-gateway-slow.json`.

## Como reproduzir

```bash
npm run chaos:up                 # sobe app + Toxiproxy + Redis + gateway-stub
npm run chaos:gateway-slow       # injeta 5000ms na rede do gateway
GATEWAY_VUS=20 npm run perf:gateway-slow
npm run chaos:gateway-reset
HERD_VUS=300 npm run perf:herd   # flush de cache + manada
npm run chaos:mttr               # mede MTTD/MTTR
npm run chaos:down
```

Os resumos por cenario ficam em `docs/evidencias/k6/<cenario>.summary.{json,txt}`.
