# O Apocalipse do Delivery

Integrantes
* Andre Augusto Silva Carvalho
* Kayler de Freitas Moura
* Igor Augusto Amaral Luz
* Gustavo Ceolin Veloso
* Gabriel da Silveira Macedo Neto

## Resumo

O projeto implementa um checkout resiliente com testes automatizados, TDD documentado, refatoracoes baseadas em padroes, teste de mutacao e cenarios SRE com k6.

| Item | Resultado |
| :--- | :--- |
| Testes Jest/Supertest | 35 testes em 7 suites |
| Mutation Testing | Stryker.js com 100.00% de Mutation Score e 0 mutantes sobreviventes |
| Performance/SRE | k6 com carga, estresse, Thundering Herd e Gateway Lento |
| SLO principal | p95 menor que 5s e taxa de erro menor que 5% |
| Organizacao | Testes centralizados em `tests/` por tipo: unit, integration, performance e support |

Comandos principais:

```bash
npm test
npm run test:mutation
npm run perf:load
npm run perf:stress
npm run perf:herd:local
npm run perf:gateway-slow
```

Como as Fases se Conectam a este Codigo

**Fase 1 (Analise & Metricas)**
Voces calcularao a Complexidade Ciclomatica do metodo processar(pedido). Notem que ele tem caminhos logicos bem claros baseados no status do pagamento e no bloco catch.

**Fase 2 (Refatoracao & Patterns)**
O e-mail sincrono acoplado dentro do fluxo de aprovacao e um erro classico de design. Voces devem usar a refatoracao para extrair essa logica e garantir via Mocks (no Jest) se o e-mail foi chamado adequadamente, ou usar Stubs para injetar respostas malformadas do gateway.

**Fase 4 (Caos & SRE)**
No arquivo server.js, a funcao gatewayPagamentoMock.cobrar simula uma promessa de 300ms. Quando voces configurarem o Toxiproxy, voces interceptarao essa chamada externa e forcarao uma latencia de 5000ms. O k6 vai disparar requisicoes para /api/v1/checkout e o grupo devera avaliar se o Express vai sofrer um colapso ou se o codigo de voces (redesenhado com circuit breaker ou timeouts curtos) vai proteger o servidor.
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

Com essa estrutura, o metodo principal `processar` ficou mais orientado ao fluxo de alto nivel, enquanto as regras especificas de cada resultado de pagamento ficaram encapsuladas em classes proprias. Isso reduz a complexidade ciclom�tica percebida, facilita a extensao para novos status do gateway e preserva o comportamento validado pela suite de testes.

## Teste de mutacao com Stryker.js

A qualidade da suite de testes tambem foi validada com **teste de mutacao**, porque cobertura de linhas so mostra quais trechos foram executados, mas nao garante que os testes detectam alteracoes indevidas na regra de negocio.

Para isso, foi configurado o **Stryker.js** no projeto Node/Jest.

| Item | Definicao no projeto |
| :--- | :--- |
| Ferramenta | Stryker.js |
| Runner de testes | Jest |
| Arquivo de configuracao | `stryker.conf.js` |
| Comando | `npm run test:mutation` |
| Meta minima obrigatoria | 80% de Mutation Score |
| Resultado obtido | 100,00% de Mutation Score |

A configuracao define que apenas o codigo de producao deve sofrer mutacao:

```javascript
mutate: [
  'src/**/*.js',
  '!src/**/*.test.js'
]
```

Tambem foi configurado um limite de quebra da build em 80%:

```javascript
thresholds: {
  high: 90,
  low: 80,
  break: 80
}
```

Na primeira execucao, alguns mutantes sobreviveram em validacoes de entrada, resposta de fallback, configuracoes de resiliencia e comportamento assincrono. A suite foi enriquecida com testes adicionais em `tests/integration/http/server.checkout.test.js` e `tests/unit/services/CheckoutService.business.test.js`, cobrindo casos como e-mail invalido, cartao nulo, cartao sem numero, resposta HTTP 500, rota operacional, bootstrap HTTP, dependencias padrao do app, timeout, limpeza de timeout, circuit breaker sem `isOpen`, erro de persistencia, falha no envio de e-mail e fluxo de erro do gateway sem resposta.

Resultado final da execucao:

```text
All files            | 100.00 mutation score
CheckoutService.js   | 100.00 mutation score
server.js            | 100.00 mutation score
```

Com isso, a suite supera a meta obrigatoria de Mutation Score minimo de 80% e terminou com 0 mutantes sobreviventes.



## Fase 4 - Engenharia do Caos e Testes de Desempenho

A fase de desempenho foi implementada com **k6**, simulando um ambiente de homologacao local para o endpoint `POST /api/v1/checkout`. Os scripts usam perfis de volumetria inspirados em Black Friday, com ramp-up, periodo steady e ramp-down.

| Script | Objetivo | Perfil de carga |
| :--- | :--- | :--- |
| `tests/performance/black-friday-load.js` | Teste de carga nominal | ramp-up ate 25 VUs, steady de 1 minuto e ramp-down |
| `tests/performance/black-friday-stress.js` | Teste de estresse progressivo | ramp-up progressivo ate 100 VUs e ramp-down |

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

### Como executar

Subir a aplicacao:

```bash
npm start
```

Executar os cenarios:

```bash
npm run perf:load
npm run perf:stress
```

Tambem e possivel apontar para outro ambiente usando `BASE_URL`.

### Evidencias de execucao local

Ambos os testes foram executados contra `http://localhost:3000`.

| Cenario | Resultado | p95 de latencia | Taxa de erro HTTP | Taxa de erro funcional |
| :--- | :--- | ---: | ---: | ---: |
| Carga Black Friday | Aprovado | 314.87 ms | 0.00% | 0.00% |
| Estresse Black Friday | Aprovado | 317.84 ms | 0.00% | 0.00% |

Com isso, a aplicacao ficou abaixo do limite de latencia p95 de 5 segundos e abaixo do limite de erro de 5% nos dois cenarios.

### Injecao de falhas - Thundering Herd

Foi adicionado o cenario `tests/performance/thundering-herd-cache-flush.js` para simular o desastre de **Thundering Herd** apos invalidacao abrupta de cache.

O fluxo do teste e:

1. executar `POST /api/v1/cache/flush`;
2. disparar 10.000 requisicoes simultaneas de checkout por padrao;
3. validar se a aplicacao respeita os SLOs de p95 menor que 5 segundos e erro menor que 5%.

Comando:

```bash
npm run perf:herd
```

Para rodadas locais menores:

```powershell
npm run perf:herd:local
```

A protecao contra sobrecarga foi reforcada no `CheckoutService` com **backoff exponencial com jitter**, evitando que retentativas de gateway voltem todas ao mesmo tempo apos uma falha ou flush de cache.



Evidencia local reduzida do cenario Thundering Herd:

```text
k6 run -e HERD_VUS=10 tests/performance/thundering-herd-cache-flush.js
p95 = 331.92 ms
http_req_failed = 0.00%
checkout_errors = 0.00%
cache_flush_errors = 0.00%
```

O script oficial permanece configurado para 10.000 VUs por padrao em `npm run perf:herd`; a execucao reduzida serve apenas para validar sintaxe e fluxo em maquina local.

### Injecao de falhas - Gateway Lento

Foi adicionado o cenario `tests/performance/gateway-lento-5000ms.js` para simular 5000 ms de latencia na API de pagamento parceira.

Para executar o desastre, suba a aplicacao com a latencia do gateway configurada:

```powershell
$env:GATEWAY_LATENCY_MS='5000'; $env:CHECKOUT_TIMEOUT_MS='1000'; $env:CHECKOUT_MAX_RETRIES='1'; $env:CHECKOUT_RETRY_DELAY_MS='100'; npm start
```

Em outro terminal:

```bash
npm run perf:gateway-slow
```

O comportamento esperado e resiliente: o checkout nao deve esperar indefinidamente o gateway lento. Como o servico possui timeout operacional de 2000 ms, retry limitado e fallback, o k6 espera HTTP 500 com mensagem amigavel e p95 abaixo de 5 segundos.

Evidencia local do cenario Gateway Lento:

```text
GATEWAY_LATENCY_MS=5000
CHECKOUT_TIMEOUT_MS=1000
CHECKOUT_MAX_RETRIES=1
CHECKOUT_RETRY_DELAY_MS=100
p95 = 2.14 s
http_req_failed = 0.00%
gateway_slow_errors = 0.00%
```

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





