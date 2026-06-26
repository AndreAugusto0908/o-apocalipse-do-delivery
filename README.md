# O Apocalipse do Delivery

Integrantes
* Andre Augusto Silva Carvalho
* Kayler de Freitas Moura
* Igor Augusto Amaral Luz
* Gustavo Ceolin Veloso
* Gabriel da Silveira Macedo Neto
* Vitor Hugo Dutra Marinho

## Resumo

O projeto implementa um checkout resiliente com testes automatizados, TDD documentado, refatoracoes baseadas em padroes, teste de mutacao e cenarios SRE com k6.

| Item | Resultado |
| :--- | :--- |
| Testes Jest/Supertest | 96 testes em 22 suites (unit + integracao) |
| BDD (Cucumber) | 7 cenarios `.feature` executaveis (Dado-Quando-Entao), 84 steps |
| Mutation Testing | Stryker.js com **98,14%** de Mutation Score (meta >= 90%) |
| Resiliencia | Circuit Breaker, Bulkhead/load-shedding, timeout em toda chamada externa, idempotencia, cache single-flight |
| Caos (SRE) | Toxiproxy real (gateway lento 5000ms + queda de cache) + calculo de MTTR |
| SLO principal | p95 menor que 5s e taxa de erro menor que 5% |
| Organizacao | `src/services/` (regra de negocio) + `tests/` por tipo + `chaos/` + `infra/` |

Comandos principais:

```bash
npm test                 # 96 testes unit + integracao (Jest)
npm run test:bdd         # 7 cenarios Gherkin (Cucumber)
npm run test:mutation    # teste de mutacao (Stryker, break >= 90%)

# Caos/SRE (requer Docker + k6):
npm run chaos:up         # sobe app + Toxiproxy + Redis + gateway-stub
npm run perf:load        # carga; perf:stress, perf:herd, perf:gateway-slow
npm run chaos:gateway-slow   # injeta 5000ms de latencia via Toxiproxy
npm run chaos:cache-down     # derruba o no de cache
npm run chaos:mttr           # mede MTTD/MTTR e grava docs/evidencias/
npm run chaos:reset && npm run chaos:down
```

Como as Fases se Conectam a este Codigo

**Fase 1 (Analise & Metricas)**
Voces calcularao a Complexidade Ciclomatica do metodo processar(pedido). Notem que ele tem caminhos logicos bem claros baseados no status do pagamento e no bloco catch.

**Fase 2 (Refatoracao & Patterns)**
O e-mail sincrono acoplado dentro do fluxo de aprovacao e um erro classico de design. Voces devem usar a refatoracao para extrair essa logica e garantir via Mocks (no Jest) se o e-mail foi chamado adequadamente, ou usar Stubs para injetar respostas malformadas do gateway.

**Fase 4 (Caos & SRE)**
O `docker-compose.yml` sobe a aplicacao falando com o gateway e com o Redis
**atraves do Toxiproxy**. Os scripts em `chaos/` injetam os toxicos: 5000ms de
latencia no gateway (`chaos:gateway-slow`) e queda do no de cache
(`chaos:cache-down`). O k6 dispara carga em `/api/v1/checkout` e o grupo avalia
se o Express colapsa ou se a arquitetura (circuit breaker, timeouts curtos,
bulkhead, backoff com jitter, single-flight no cache) protege o servidor.
Detalhes em `tests/performance/README.md`.
## Ciclo TDD aplicado

O desenvolvimento da solucao foi conduzido seguindo o ciclo TDD Vermelho-Verde-Refatore. Primeiro foram definidos os comportamentos esperados em testes automatizados com Jest e Supertest. Em seguida, a implementacao foi evoluida de forma incremental ate que os testes passassem. Por fim, o codigo foi refatorado para reduzir acoplamento, isolar dependencias externas e melhorar a clareza da regra de negocio sem alterar o comportamento validado pelos testes.

| Requisito validado | Teste criado primeiro | Vermelho: falha esperada | Verde: implementacao minima | Refatore: melhoria aplicada |
| :--- | :--- | :--- | :--- | :--- |
| Rejeitar payload incompleto antes do checkout | `tests/integration/http/server.checkout.test.js` valida ausencia de `clienteEmail`, valor invalido e cartao incompleto | A rota aceitava dados invalidos ou chamava o servico mesmo com payload incompleto | Validacao de entrada passou a retornar HTTP 400 e impedir chamada ao checkout | Extracao das funcoes `pedidoValido`, `cartaoValido` e `criarPedidoCheckout` |
| Processar pagamento aprovado | `tests/unit/services/CheckoutService.business.test.js` verifica status `PROCESSADO`, persistencia e envio de e-mail | O fluxo aprovado nao garantia persistencia correta nem isolamento do envio de e-mail | Pedido aprovado passou a ser salvo como `PROCESSADO` e a solicitar confirmacao | Dependencias externas foram injetadas por construtor e validadas com mocks |
| Nao enviar e-mail quando pagamento for recusado | Teste unitario simula gateway retornando `RECUSADO` | O fluxo poderia tratar qualquer retorno como sucesso ou disparar confirmacao indevida | Pedido recusado passou a ser salvo como `FALHOU` e retornar `null` | Criacao de handlers para separar resultado aprovado e recusado |
| Recuperar falha transitoria do gateway | Teste usa stub que falha uma vez e aprova na segunda tentativa | Uma excecao do gateway encerrava o processamento sem nova tentativa | Inclusao de retry com quantidade configuravel de tentativas | Parametrizacao de `maxRetries` e `retryDelayMs` para facilitar testes e manutencao |
| Aplicar timeout e fallback em indisponibilidade persistente | Teste simula gateway sem resposta e erros persistentes | O processamento podia ficar bloqueado aguardando uma promessa sem fim | Inclusao de timeout, esgotamento de retentativas e status `ERRO_GATEWAY` | Isolamento dos metodos `comTimeout`, `cobrarComResiliencia` e `registrarErroGateway` |
| Evitar chamada ao gateway com circuit breaker aberto | Teste injeta `circuitBreaker.isOpen()` retornando verdadeiro | O checkout tentaria chamar o gateway mesmo quando a integracao estivesse indisponivel | Fallback imediato com persistencia de `ERRO_GATEWAY` | Criacao do metodo `gatewayIndisponivel` para centralizar a decisao |

Com esse ciclo, os testes serviram como contrato de comportamento antes da implementacao final. A execucao atual confirma o estado verde da suite:

## Test Patterns e Clean Code nos testes

Os testes foram estruturados para evitar o cheiro de codigo conhecido como **Obscure Setup**, mantendo a preparacao dos cenarios clara, reutilizavel e modular. Para isso, foram aplicados os padroes **Data Builder** e **Object Mother** na criacao dos pedidos usados nos testes.

| Exigencia | Como foi aplicado no projeto | Arquivo |
| :--- | :--- | :--- |
| Proibir Obscure Setup | A massa de teste nao fica espalhada dentro de cada cenario; os pedidos sao criados por builders e mothers reutilizaveis | `tests/integration/http/server.checkout.test.js` e `tests/unit/services/CheckoutService.business.test.js` |
| Aplicar Data Builder | `PedidoCheckoutBuilder` e `PedidoBuilder` permitem montar pedidos validos e variar somente o dado relevante para cada teste | `tests/integration/http/server.checkout.test.js` e `tests/unit/services/CheckoutService.business.test.js` |
| Aplicar Object Mother | `PedidoCheckoutMother` e `PedidoMother` oferecem fabricas semanticas como pedido valido, sem e-mail, valor invalido e cartao incompleto | `tests/integration/http/server.checkout.test.js` e `tests/unit/services/CheckoutService.business.test.js` |
| Usar Stubs para estados de pagamento | `GatewayPagamentoStub` simula respostas do gateway como `APROVADO`, `RECUSADO`, erro transitorio, indisponibilidade persistente e ausencia de resposta | `tests/unit/services/CheckoutService.business.test.js` |
| Usar Stubs para persistencia | `PedidoRepositoryStub` simula o salvamento do pedido e retorna um pedido com identificador | `tests/unit/services/CheckoutService.business.test.js` |
| Usar Mocks para comportamento | `EmailServiceMock` permite verificar se o e-mail de confirmacao foi disparado ou bloqueado conforme o resultado do pagamento | `tests/unit/services/CheckoutService.business.test.js` |

Exemplos de assercoes de comportamento implementadas:

```javascript
expect(deps.emailService.enviarConfirmacao).toHaveBeenCalledWith(
  'cliente@entregasja.com',
  'Pagamento Aprovado'
);

expect(deps.emailService.enviarConfirmacao).not.toHaveBeenCalled();
```

Dessa forma, os testes deixam explicito o comportamento esperado sem repetir configuracoes extensas em cada caso, melhorando legibilidade, manutencao e aderencia a Clean Code.

## Refatoracao baseada em padroes

Durante a evolucao do checkout legado, foram identificados pontos de baixa legibilidade e alto acoplamento que dificultavam a escrita de testes e a manutencao da regra de negocio. Para reduzir esses problemas, foram aplicadas refatoracoes classicas descritas por Martin Fowler, com foco em eliminar blocos condicionais extensos, separar responsabilidades e tornar o comportamento mais testavel.

| Test smell ou code smell identificado | Refatoracao aplicada | Como ficou no projeto |
| :--- | :--- | :--- |
| Preparacao confusa dos cenarios de teste, com risco de **Obscure Setup** | Data Builder e Object Mother | Os pedidos de teste passaram a ser fabricados por `PedidoCheckoutBuilder`, `PedidoCheckoutMother`, `PedidoBuilder` e `PedidoMother` |
| Metodo de rota concentrando validacao, criacao de pedido, execucao do checkout e resposta HTTP | Extract Method | A rota foi simplificada com funcoes como `pedidoValido`, `cartaoValido`, `criarPedidoCheckout` e `responderResultadoCheckout` |
| Regra de negocio do checkout misturada com detalhes de timeout, retry e fallback | Extract Method | O fluxo foi separado em metodos como `gatewayIndisponivel`, `cobrarComResiliencia`, `comTimeout`, `esperar` e `registrarErroGateway` |
| Construtor com varias dependencias e configuracoes soltas | Introduce Parameter Object | O `CheckoutService` passou a receber objetos de `dependencies` e `options`, agrupando gateway, repositorio, e-mail, timeout, retries e circuit breaker |
| Decisao por status de pagamento podendo crescer em blocos de `if/else` ou `switch` | Replace Conditional with Polymorphism | Os resultados do pagamento foram separados em `PagamentoAprovadoHandler` e `PagamentoRecusadoHandler`, escolhidos por um mapa de handlers |
| Dependencias externas dificultando testes isolados | Dependency Injection | Gateway de pagamento, repositorio de pedidos e servico de e-mail passaram a ser injetados, permitindo uso de stubs e mocks nos testes |

Exemplo da substituicao de condicional por polimorfismo:

```javascript
const criarResultadoPagamentoHandlers = (checkoutService) => ({
  APROVADO: new PagamentoAprovadoHandler(checkoutService),
  RECUSADO: new PagamentoRecusadoHandler(checkoutService)
});
```

Com essa estrutura, o metodo principal `processar` ficou mais orientado ao fluxo de alto nivel, enquanto as regras especificas de cada resultado de pagamento ficaram encapsuladas em classes proprias. Isso reduz a complexidade ciclomatica percebida, facilita a extensao para novos status do gateway e preserva o comportamento validado pela suite de testes.

## Teste de mutacao com Stryker.js

A qualidade da suite de testes tambem foi validada com **teste de mutacao**, porque cobertura de linhas so mostra quais trechos foram executados, mas nao garante que os testes detectam alteracoes indevidas na regra de negocio.

Para isso, foi configurado o **Stryker.js** no projeto Node/Jest.

| Item | Definicao no projeto |
| :--- | :--- |
| Ferramenta | Stryker.js |
| Runner de testes | Jest |
| Arquivo de configuracao | `stryker.conf.js` |
| Comando | `npm run test:mutation` |
| Meta minima obrigatoria | 90% de Mutation Score (criterio mais rigoroso da rubrica) |
| Resultado obtido | **98,14%** de Mutation Score |

A configuracao muta a regra de negocio em `src/`, excluindo o stub de infra:

```javascript
mutate: [
  'src/**/*.js',
  '!src/gateway-stub/**/*.js'
]
```

O limite de quebra da build foi elevado para 90% (a build falha abaixo disso):

```javascript
thresholds: {
  high: 90,
  low: 80,
  break: 90
}
```

Na primeira execucao, alguns mutantes sobreviveram em validacoes de entrada, resposta de fallback, configuracoes de resiliencia e comportamento assincrono. A suite foi enriquecida com testes adicionais em `tests/integration/http/server.checkout.test.js` e `tests/unit/services/CheckoutService.business.test.js`, cobrindo casos como e-mail invalido, cartao nulo, cartao sem numero, resposta HTTP 500, rota operacional, bootstrap HTTP, dependencias padrao do app, timeout, limpeza de timeout, circuit breaker sem `isOpen`, erro de persistencia, falha no envio de e-mail e fluxo de erro do gateway sem resposta.

Resultado final da execucao (evidencia versionada em `docs/evidencias/`):

```text
All files               | 98,14 mutation score
CircuitBreaker.js       | 100,00
CheckoutService.js      | 100,00
Bulkhead.js             | 100,00
server.js               |  98,78
GatewayPagamentoHttp.js |  96,15
CacheService.js         |  93,33
```

A suite supera a meta de 90%. Os 6 mutantes sobreviventes sao **equivalentes**
(mensagens de log, chave de cache opaca, guard defensivo e `clearTimeout` de
cleanup) e estao justificados tecnicamente em
[`docs/evidencias/mutation-summary.md`](docs/evidencias/mutation-summary.md).
O relatorio bruto fica em `docs/evidencias/mutation.json`.



## BDD executavel (Fase 2)

Os arquivos `features/*.feature` sao **especificacao viva executavel** (nao
decorativa): ligados ao app real via Cucumber + Supertest.

```bash
npm run test:bdd   # 7 cenarios, 84 steps (Dado-Quando-Entao em pt-BR)
```

Cobrem sucesso, cartao recusado, payload invalido e os caminhos infelizes de
resiliencia: timeout do gateway, retry recuperado, retry esgotado e circuit
breaker aberto. As step definitions ficam em `features/support/steps.js`.

## Padroes de Resiliencia (Fase 4B)

A defesa contra o efeito cascata e a exaustao de recursos esta no codigo, com
seams de injecao de dependencia (cada padrao tem teste e contribui para o
Mutation Score):

| Padrao | Onde | O que protege |
| :--- | :--- | :--- |
| **Circuit Breaker** | `src/services/CircuitBreaker.js` (instanciado em `server.js`) | Para de marcar o gateway quando a taxa de falha passa de 50% (closed/open/half-open) |
| **Bulkhead + load-shedding** | `src/services/Bulkhead.js` | Limita concorrencia; excesso recebe HTTP 503 em vez de esgotar o pool |
| **Timeout em toda chamada externa** | `CheckoutService.comTimeout`/`persistir` | Gateway e repositorio nao penduram o event loop |
| **Retry com backoff + jitter** | `CheckoutService.calcularBackoffComJitter` | Retentativas nao voltam todas ao mesmo tempo (anti thundering herd) |
| **Idempotencia** | `idempotencyKey` por pedido | Evita cobranca dupla no retry apos timeout |
| **Cache single-flight + fallback** | `src/services/CacheService.js` | Manada de cache miss vira uma so leitura ao banco; degrada se o Redis cai |

## Fase 4 - Engenharia do Caos e Testes de Desempenho

A fase de desempenho foi implementada com **k6**, simulando um ambiente de homologacao local para o endpoint `POST /api/v1/checkout`. Os scripts usam perfis de volumetria inspirados em Black Friday, com ramp-up, periodo steady e ramp-down.

> **Resultados comprovados** (execucao real, evidencia em
> [`docs/evidencias/sre-summary.md`](docs/evidencias/sre-summary.md)):
> gateway lento (5000ms via Toxiproxy) &rarr; **p95 = 3321 ms**, 0% erro, 100%
> fallback controlado; thundering herd (flush + 300 VUs) &rarr; **p95 = 2100 ms**,
> 0% erro; **MTTR = 3290 ms**. Todos os SLOs mantidos.

| Script | Objetivo | Perfil de carga (parametrizavel) |
| :--- | :--- | :--- |
| `black-friday-load.js` | Carga nominal | ramp-up ate 200 VUs (`LOAD_VUS`), 2 min steady, ramp-down |
| `black-friday-stress.js` | Estresse progressivo | ramp ate 500 VUs (`STRESS_VUS`) |
| `gateway-lento-5000ms.js` | Gateway lento (resiliencia) | 50 VUs (`GATEWAY_VUS`) |
| `thundering-herd-cache-flush.js` | Manada apos flush de cache | 10.000 VUs (`HERD_VUS`) |

### SLI/SLO definidos

| Indicador | Metrica k6 | SLO obrigatorio |
| :--- | :--- | :--- |
| Latencia p95 | `http_req_duration` | menor que 5 segundos |
| Taxa de erro HTTP | `http_req_failed` | menor que 5% |
| Taxa de erro funcional | `checkout_errors` | menor que 5% |

Os thresholds ficam versionados nos proprios scripts k6:

```javascript
thresholds: {
  http_req_duration: ['p(95)<5000'],
  http_req_failed: ['rate<0.05'],
  checkout_errors: ['rate<0.05']
}
```

### Como executar o caos (Docker + Toxiproxy)

A aplicacao fala com o gateway e com o Redis **atraves do Toxiproxy**, permitindo
injetar latencia/queda na rede sem alterar o codigo:

```bash
npm run chaos:up            # sobe app + Toxiproxy + Redis + gateway-stub
npm run perf:load           # carga nominal
npm run perf:stress         # estresse
```

Cada script grava evidencia em `docs/evidencias/k6/<cenario>.summary.{json,txt}`
via `handleSummary` (artefato versionavel, em vez de saida colada).

### Injecao de falhas - Gateway Lento (Toxiproxy)

A latencia de 5000 ms NAO e simulada no codigo: e injetada na rede pelo Toxiproxy.

```bash
npm run chaos:gateway-slow  # adiciona toxic de 5000ms na chamada do gateway
npm run perf:gateway-slow   # k6 mede a degradacao graciosa
npm run chaos:gateway-reset # remove a latencia
```

Comportamento esperado: o checkout nao espera os 5000 ms. Com timeout (2000 ms),
retry limitado, circuit breaker e fallback, responde 200 ou 500 (fallback
controlado) sempre abaixo de 5 s. Apenas 502/503/504/timeout de transporte
contam como `http_req_failed`.

### Injecao de falhas - Thundering Herd

```bash
npm run perf:herd        # faz FLUSHDB real no Redis e dispara 10.000 VUs
npm run perf:herd:local  # rodada reduzida (100 VUs) para validar fluxo
npm run chaos:cache-down # alternativa: derruba o no de cache pela rede
```

Sobrevivencia garantida por **single-flight** no cache (uma so leitura ao banco
por chave) + **backoff exponencial com jitter** no gateway (retentativas nao
voltam juntas) + degradacao graciosa quando o Redis cai.

### MTTR (Mean Time To Recovery)

```bash
npm run chaos:mttr        # gateway lento: injeta, detecta, remove, mede recuperacao
npm run chaos:mttr:cache  # mesmo experimento para a queda de cache
```

Gera `docs/evidencias/mttr-<falha>.json` com `mttd_ms`, `mttr_ms` e
`downtime_total_ms`. Detalhes em `tests/performance/README.md`.

## Organizacao dos testes automatizados

A pasta `tests/` centraliza os testes por objetivo para facilitar a leitura da entrega e evidenciar cada parte do trabalho:

| Arquivo | Objetivo |
| :--- | :--- |
| `tests/unit/services/CheckoutService.business.test.js` | Fluxos principais de negocio: pagamento aprovado, persistencia e e-mail; pagamento recusado sem confirmacao |
| `tests/unit/services/CheckoutService.resilience.test.js` | Resiliencia e caos: retry, timeout, fallback, circuit breaker, backoff exponencial e jitter |
| `tests/unit/services/CheckoutService.mutation.test.js` | Contratos adicionais criados para eliminar mutantes sobreviventes no Stryker |
| `tests/support/CheckoutServiceTestSupport.js` | Builders, Object Mothers, Stubs, Mocks e factory `montarCheckout` compartilhados pelos testes |
| `tests/integration/http/server.checkout.test.js` | Contrato principal da rota `POST /api/v1/checkout`: validacao de payload e resposta de sucesso |
| `tests/integration/http/server.mutation.test.js` | Contratos adicionais da camada HTTP usados para eliminar mutantes sobreviventes |
| `tests/integration/http/server.operational.test.js` | Rotas operacionais e bootstrap HTTP da aplicacao |
| `tests/integration/http/server.gateway-slow.test.js` | Configuracoes do desastre Gateway Lento e latencia simulada de 5000 ms |
| `tests/support/ServerTestSupport.js` | Builder, Object Mother e mocks compartilhados pelos testes HTTP |

Essa separacao deixa claro quais testes provam regra de negocio, quais provam resiliencia/SRE, quais validam a camada HTTP e quais existem especificamente para fortalecer a suite contra teste de mutacao.





