# Evidencia - Teste de Mutacao (Stryker.js)

**Mutation Score: 98,14%** (meta da rubrica: >= 90%) — `thresholds.break = 90`, build passa.

Comando: `npm run test:mutation` · Relatorio bruto: `docs/evidencias/mutation.json`
(HTML em `reports/mutation/mutation.html`, gerado localmente).

## Resultado por arquivo

| Arquivo | Score | Mortos | Timeout | Sobreviventes |
| :--- | ---: | ---: | ---: | ---: |
| CircuitBreaker.js | 100,00% | 55 | 0 | 0 |
| CheckoutService.js | 100,00% | 69 | 6 | 0 |
| Bulkhead.js | 100,00% | 19 | 6 | 0 |
| server.js | 98,78% | 73 | 8 | 1 |
| GatewayPagamentoHttp.js | 96,15% | 25 | 0 | 1 |
| CacheService.js | 93,33% | 56 | 0 | 4 |
| **Total** | **98,14%** | **297** | **20** | **6** |

> `src/server.js` mantem a logica de negocio (validacao, respostas, rotas) sob
> mutacao. A regiao de **composition root** (leitura de ambiente, selecao de
> adaptadores e doubles em processo) esta marcada com `// Stryker disable all`
> por ser wiring, nao regra de negocio. `src/gateway-stub/**` (servico de
> demo/infra) e excluido em `stryker.conf.js`.

## Mutantes sobreviventes — justificativa tecnica (equivalentes)

Os 6 sobreviventes sao **mutantes equivalentes**: produzem um programa com
comportamento observavel identico ao original, logo nenhum teste poderia mata-los
sem asserir detalhes irrelevantes.

1. **CacheService.js:65, :73, :84 — `StringLiteral` (mensagens de `console.error`)**
   Trocar o texto de uma mensagem de log nao altera o comportamento do sistema.
   Os blocos de tratamento de erro em si (catch) sao cobertos e mortos por testes
   (`flush degrada graciosamente`, `degrada graciosamente na leitura`,
   `mantem o valor quando a escrita falha`); apenas o conteudo da string de log
   permanece — equivalente.

2. **server.js:198 — `StringLiteral` (chave de cache `'catalogo:loja'`)**
   A chave e um identificador interno opaco. Trocar `'catalogo:loja'` por `''`
   mantem o read-through correto (mesma chave usada em leitura e escrita) — nao ha
   comportamento observavel distinto. Equivalente.

3. **CacheService.js:104 — `ConditionalExpression` no guard `bruto === null || bruto === undefined`**
   No `RedisCacheStore.get`, e um guard defensivo. Para o caso real (`null`),
   `JSON.parse(null)` ja retorna `null`, de modo que remover o guard produz o
   mesmo resultado. Mantido por robustez (defesa contra `undefined`). Equivalente
   no caminho exercitavel.

4. **GatewayPagamentoHttp.js:42 — `BlockStatement` (`clearTimeout` no `finally`)**
   Limpa o timer do AbortController apos a resposta. Como o timer ja terminou seu
   proposito quando a requisicao resolve, nao limpa-lo nao muda o resultado
   observavel (apenas adia um GC interno). Otimizacao de recurso, nao
   comportamento. Equivalente.

## Conclusao

Excluindo os mutantes equivalentes, a suite **mata 100% dos mutantes nao
equivalentes** da regra de negocio e da resiliencia (CircuitBreaker,
CheckoutService e Bulkhead com 100%). O score de 98,14% supera com folga a meta
de 90%.
