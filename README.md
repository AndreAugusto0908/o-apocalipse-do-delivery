# O Apocalipse do Delivery

Intrgrantes
* André Augusto Silva Carvalho
* Kayler de Freitas Moura
* Igor Augusto Amaral Luz
* Gustavo Ceolin Veloso
* Gabriel da Silveira Macedo Neto


Como as Fases se Conectam a este Código

**Fase 1 (Análise & Métricas)**
Vocês calcularão a Complexidade Ciclomática do método processar(pedido). Notem que ele tem caminhos lógicos bem claros baseados no status do pagamento e no bloco catch.

**Fase 2 (Refatoração & Patterns)**
O e-mail síncrono acoplado dentro do fluxo de aprovação é um erro clássico de design. Vocês devem usar a refatoração para extrair essa lógica e garantir via Mocks (no Jest) se o e-mail foi chamado adequadamente, ou usar Stubs para injetar respostas malformadas do gateway.

**Fase 4 (Caos & SRE)**
No arquivo server.js, a função gatewayPagamentoMock.cobrar simula uma promessa de 300ms. Quando vocês configurarem o Toxiproxy, vocês interceptarão essa chamada externa e forçarão uma latência de 5000ms. O k6 vai disparar requisições para /api/v1/checkout e o grupo deverá avaliar se o Express vai sofrer um colapso ou se o código de vocês (redesenhado com circuit breaker ou timeouts curtos) vai proteger o servidor.
## Ciclo TDD aplicado

O desenvolvimento da solucao foi conduzido seguindo o ciclo TDD Vermelho-Verde-Refatore. Primeiro foram definidos os comportamentos esperados em testes automatizados com Jest e Supertest. Em seguida, a implementacao foi evoluida de forma incremental ate que os testes passassem. Por fim, o codigo foi refatorado para reduzir acoplamento, isolar dependencias externas e melhorar a clareza da regra de negocio sem alterar o comportamento validado pelos testes.

| Requisito validado | Teste criado primeiro | Vermelho: falha esperada | Verde: implementacao minima | Refatore: melhoria aplicada |
| :--- | :--- | :--- | :--- | :--- |
| Rejeitar payload incompleto antes do checkout | `src/server.test.js` valida ausencia de `clienteEmail`, valor invalido e cartao incompleto | A rota aceitava dados invalidos ou chamava o servico mesmo com payload incompleto | Validacao de entrada passou a retornar HTTP 400 e impedir chamada ao checkout | Extracao das funcoes `pedidoValido`, `cartaoValido` e `criarPedidoCheckout` |
| Processar pagamento aprovado | `src/services/CheckoutService.test.js` verifica status `PROCESSADO`, persistencia e envio de e-mail | O fluxo aprovado nao garantia persistencia correta nem isolamento do envio de e-mail | Pedido aprovado passou a ser salvo como `PROCESSADO` e a solicitar confirmacao | Dependencias externas foram injetadas por construtor e validadas com mocks |
| Nao enviar e-mail quando pagamento for recusado | Teste unitario simula gateway retornando `RECUSADO` | O fluxo poderia tratar qualquer retorno como sucesso ou disparar confirmacao indevida | Pedido recusado passou a ser salvo como `FALHOU` e retornar `null` | Criacao de handlers para separar resultado aprovado e recusado |
| Recuperar falha transitoria do gateway | Teste usa stub que falha uma vez e aprova na segunda tentativa | Uma excecao do gateway encerrava o processamento sem nova tentativa | Inclusao de retry com quantidade configuravel de tentativas | Parametrizacao de `maxRetries` e `retryDelayMs` para facilitar testes e manutencao |
| Aplicar timeout e fallback em indisponibilidade persistente | Teste simula gateway sem resposta e erros persistentes | O processamento podia ficar bloqueado aguardando uma promessa sem fim | Inclusao de timeout, esgotamento de retentativas e status `ERRO_GATEWAY` | Isolamento dos metodos `comTimeout`, `cobrarComResiliencia` e `registrarErroGateway` |
| Evitar chamada ao gateway com circuit breaker aberto | Teste injeta `circuitBreaker.isOpen()` retornando verdadeiro | O checkout tentaria chamar o gateway mesmo quando a integracao estivesse indisponivel | Fallback imediato com persistencia de `ERRO_GATEWAY` | Criacao do metodo `gatewayIndisponivel` para centralizar a decisao |

Com esse ciclo, os testes serviram como contrato de comportamento antes da implementacao final. A execucao atual confirma o estado verde da suite:

```text
Test Suites: 2 passed, 2 total
Tests:       10 passed, 10 total
```

## Test Patterns e Clean Code nos testes

Os testes foram estruturados para evitar o cheiro de codigo conhecido como **Obscure Setup**, mantendo a preparacao dos cenarios clara, reutilizavel e modular. Para isso, foram aplicados os padroes **Data Builder** e **Object Mother** na criacao dos pedidos usados nos testes.

| Exigencia | Como foi aplicado no projeto | Arquivo |
| :--- | :--- | :--- |
| Proibir Obscure Setup | A massa de teste nao fica espalhada dentro de cada cenario; os pedidos sao criados por builders e mothers reutilizaveis | `src/server.test.js` e `src/services/CheckoutService.test.js` |
| Aplicar Data Builder | `PedidoCheckoutBuilder` e `PedidoBuilder` permitem montar pedidos validos e variar somente o dado relevante para cada teste | `src/server.test.js` e `src/services/CheckoutService.test.js` |
| Aplicar Object Mother | `PedidoCheckoutMother` e `PedidoMother` oferecem fabricas semanticas como pedido valido, sem e-mail, valor invalido e cartao incompleto | `src/server.test.js` e `src/services/CheckoutService.test.js` |
| Usar Stubs para estados de pagamento | `GatewayPagamentoStub` simula respostas do gateway como `APROVADO`, `RECUSADO`, erro transitorio, indisponibilidade persistente e ausencia de resposta | `src/services/CheckoutService.test.js` |
| Usar Stubs para persistencia | `PedidoRepositoryStub` simula o salvamento do pedido e retorna um pedido com identificador | `src/services/CheckoutService.test.js` |
| Usar Mocks para comportamento | `EmailServiceMock` permite verificar se o e-mail de confirmacao foi disparado ou bloqueado conforme o resultado do pagamento | `src/services/CheckoutService.test.js` |

Exemplos de assercoes de comportamento implementadas:

```javascript
expect(deps.emailService.enviarConfirmacao).toHaveBeenCalledWith(
  'cliente@entregasja.com',
  'Pagamento Aprovado'
);

expect(deps.emailService.enviarConfirmacao).not.toHaveBeenCalled();
```

Dessa forma, os testes deixam explicito o comportamento esperado sem repetir configuracoes extensas em cada caso, melhorando legibilidade, manutencao e aderencia a Clean Code.
