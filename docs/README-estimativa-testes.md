# Estimativa de Testes - CheckoutService

## 1. Identificacao do Documento

**Projeto:** O Apocalipse do Delivery  
**Componente avaliado:** `CheckoutService.processar(pedido)`  
**Artefatos de referencia:** `src/services/CheckoutService.js`, `docs/especificacao.md` e `docs/fluxo-controle-checkout.html`  
**Fase:** Fase 1 - Analise Estrutural, Complexidade e Metricas de Estimativa  
**Tecnica utilizada:** Pontos de Caso de Teste adaptados para testes funcionais, resiliencia e desempenho  

## 2. Objetivo

Este documento apresenta uma estimativa formal do esforco necessario para testar completamente a funcionalidade de checkout, considerando os fluxos de negocio, os fluxos de excecao, os requisitos nao funcionais e os riscos arquiteturais descritos na especificacao.

O objetivo da estimativa e dimensionar:

- quantidade de cenarios de teste;
- complexidade relativa dos cenarios;
- esforco em horas/homem;
- perfis necessarios na equipe;
- recursos tecnicos e ambientes de teste.

## 3. Escopo de Teste

O escopo cobre o processamento de pedidos no fluxo de checkout, incluindo:

- validacao de entrada do payload;
- cobranca via gateway de pagamento;
- persistencia do status final do pedido;
- envio de confirmacao por e-mail;
- tratamento de pagamento aprovado;
- tratamento de pagamento recusado;
- tratamento de erro de infraestrutura;
- timeout operacional de 2000 ms;
- politica de retry com ate 3 retentativas;
- backoff exponencial com jitter (base de 500 ms);
- fallback com status `ERRO_GATEWAY`;
- comportamento esperado com circuit breaker;
- testes de carga e latencia usando k6;
- verificacao de nao envio de e-mail em pagamentos recusados.

## 4. Premissas

- A funcionalidade sera testada apos a implementacao dos requisitos descritos no DER.
- Os testes automatizados serao escritos preferencialmente com Jest para testes unitarios e de integracao.
- Os testes de carga serao executados com k6.
- Falhas de rede, timeout e instabilidade do gateway poderao ser simuladas com mocks, stubs ou Toxiproxy.
- A estimativa considera criacao dos testes, revisao, execucao, analise de resultado e ajustes nos cenarios.
- Correcao de defeitos encontrados nao esta incluida como esforco de desenvolvimento, apenas o reteste e a validacao.

## 5. Tecnica de Estimativa

Foi utilizada a tecnica de Pontos de Caso de Teste adaptada. Cada caso de teste recebe uma classificacao de complexidade conforme o numero de dependencias, preparacao de massa, integracoes, assincronicidade e necessidade de simulacao de falhas.

| Complexidade | Peso | Criterio |
| :--- | ---: | :--- |
| Simples | 2 pontos | Validacao direta, pouca massa de dados, sem integracao externa relevante. |
| Media | 4 pontos | Envolve mocks, verificacao de persistencia ou validacao de contrato HTTP. |
| Complexa | 8 pontos | Envolve assincronicidade, retry, timeout, fallback ou multiplas dependencias. |
| Critica | 13 pontos | Envolve teste de carga, concorrencia, caos, SLO ou ambiente com infraestrutura auxiliar. |

Para converter pontos em esforco, foi adotada a produtividade media de **1,5 hora por ponto de teste**.

Formula aplicada:

```text
Esforco base = Total de pontos de teste x 1,5 hora
Esforco total = Esforco base + 20% de contingencia
```

A contingencia cobre ajustes de massa, instabilidade de ambiente, refinamento de mocks, falsos negativos e retestes.

## 6. Matriz de Casos de Teste Estimados

| ID | Cenario de teste | Tipo | Complexidade | Pontos |
| :--- | :--- | :--- | :--- | ---: |
| CT01 | Rejeitar payload sem `clienteEmail` | Unitario/API | Simples | 2 |
| CT02 | Rejeitar payload com e-mail invalido | Unitario/API | Simples | 2 |
| CT03 | Rejeitar payload com `valor <= 0` | Unitario/API | Simples | 2 |
| CT04 | Rejeitar payload sem dados obrigatorios do `cartao` | Unitario/API | Simples | 2 |
| CT05 | Processar pagamento aprovado e salvar pedido como `PROCESSADO` | Unitario | Media | 4 |
| CT06 | Retornar sucesso HTTP para pagamento aprovado | Integracao/API | Media | 4 |
| CT07 | Enviar e-mail de confirmacao somente para pedido aprovado | Unitario | Media | 4 |
| CT08 | Garantir que envio de e-mail nao bloqueia a resposta principal | Integracao | Complexa | 8 |
| CT09 | Processar pagamento recusado e salvar pedido como `FALHOU` | Unitario | Media | 4 |
| CT10 | Nao enviar e-mail para pagamento recusado | Unitario | Media | 4 |
| CT11 | Retornar erro HTTP esperado para pagamento recusado | Integracao/API | Media | 4 |
| CT12 | Tratar excecao simples do gateway e salvar `ERRO_GATEWAY` | Unitario | Media | 4 |
| CT13 | Aplicar timeout quando gateway exceder 2000 ms | Integracao | Complexa | 8 |
| CT14 | Executar retry quando ocorrer erro transitorio de infraestrutura | Unitario | Complexa | 8 |
| CT15 | Recuperar no retry e concluir pedido como `PROCESSADO` | Integracao | Complexa | 8 |
| CT16 | Esgotar 3 retentativas e acionar fallback | Integracao | Complexa | 8 |
| CT17 | Respeitar backoff exponencial com jitter (base 500 ms) entre tentativas | Unitario | Complexa | 8 |
| CT18 | Bloquear chamada ao gateway quando circuit breaker estiver aberto | Integracao | Complexa | 8 |
| CT19 | Retornar mensagem amigavel no fallback de erro critico | API | Media | 4 |
| CT20 | Garantir que erros nao gerem excecoes nao capturadas no Node.js | Resiliencia | Complexa | 8 |
| CT21 | Validar contrato dos status finais: `PROCESSADO`, `FALHOU`, `ERRO_GATEWAY` | Integracao | Media | 4 |
| CT22 | Teste de carga com taxa de sucesso global acima de 95% | Performance | Critica | 13 |
| CT23 | Teste de latencia com p95 dentro do SLO (< 5000 ms) | Performance | Critica | 13 |
| CT24 | Teste de estresse com latencia artificial no gateway via Toxiproxy | Caos/SRE | Critica | 13 |

**Total de pontos de teste:** 147 pontos

## 7. Calculo de Esforco

| Item | Calculo | Resultado |
| :--- | :--- | ---: |
| Pontos totais de teste | Soma dos pontos da matriz | 147 pontos |
| Produtividade adotada | 1,5 h por ponto | - |
| Esforco base | 147 x 1,5 h | 220,5 h |
| Contingencia tecnica | 20% de 220,5 h | 44,1 h |
| Esforco total estimado | 220,5 h + 44,1 h | 264,6 h |

**Estimativa arredondada:** **265 horas/homem**

## 8. Distribuicao do Esforco por Atividade

| Atividade | Percentual | Horas estimadas |
| :--- | ---: | ---: |
| Planejamento e desenho dos cenarios | 15% | 40 h |
| Implementacao dos testes unitarios | 20% | 53 h |
| Implementacao dos testes de integracao/API | 20% | 53 h |
| Implementacao dos testes de resiliencia | 15% | 40 h |
| Preparacao de ambiente, mocks, stubs e Toxiproxy | 10% | 26 h |
| Testes de carga, estresse e analise de SLO | 10% | 26 h |
| Execucao, evidencias, reteste e relatorio final | 10% | 27 h |
| **Total** | **100%** | **265 h** |

## 9. Recursos Humanos Necessarios

| Papel | Responsabilidade | Alocacao sugerida |
| :--- | :--- | :--- |
| QA Engineer | Criacao dos cenarios, testes unitarios, integracao, evidencias e relatorio | 1 pessoa em tempo integral |
| Desenvolvedor Backend | Apoio em mocks, contratos, instrumentacao e analise de defeitos | 1 pessoa em tempo parcial |
| Engenheiro SRE/Performance | Configuracao de k6, Toxiproxy, testes de carga e analise de SLO | 1 pessoa em tempo parcial |
| Revisor tecnico | Revisao dos cenarios, cobertura e criterios de aceite | 1 pessoa sob demanda |

## 10. Recursos Tecnicos Necessarios

- Ambiente Node.js compativel com o projeto.
- Jest ou ferramenta equivalente para testes unitarios.
- Supertest ou ferramenta equivalente para testes HTTP no Express.
- k6 para testes de carga e estresse.
- Toxiproxy para injecao controlada de latencia e falhas de rede.
- Mocks ou stubs para `gatewayPagamento`, `pedidoRepository` e `emailService`.
- Relatorio de cobertura de testes.
- Logs estruturados ou saidas verificaveis para falhas de gateway, timeout e fallback.
- Massa de teste com pedidos aprovados, recusados, invalidos e sujeitos a erro de infraestrutura.

## 11. Criterios de Aceite da Estrategia de Teste

A funcionalidade sera considerada suficientemente testada quando:

- todos os fluxos funcionais da matriz de rastreabilidade forem cobertos;
- todos os caminhos independentes do metodo principal forem exercitados (V(G) = 4 para `processar`, ver `docs/fluxo-controle-checkout.html`);
- houver testes negativos para payload invalido;
- pagamentos recusados nao dispararem e-mail de confirmacao;
- falhas do gateway resultarem em `ERRO_GATEWAY` sem excecao nao capturada;
- retries, timeout e backoff forem verificados por testes automatizados;
- o fallback for testado apos esgotamento das retentativas;
- o endpoint atingir taxa de sucesso global superior a 95% no teste de carga;
- o p95 das requisicoes ficar abaixo do SLO de 5000 ms;
- os resultados forem documentados com evidencias de execucao.

## 12. Riscos da Estimativa

| Risco | Impacto | Mitigacao |
| :--- | :--- | :--- |
| Circuit breaker implementado (`CircuitBreaker.js`) e exercitado por testes | Baixo | Manter cobertura de mutacao sobre as transicoes de estado (closed/open/half-open). |
| E-mail atualmente acoplado ao fluxo sincrono | Medio | Isolar por mock e validar comportamento assincromo apos refatoracao. |
| Simulacao de timeout pode variar conforme ambiente | Medio | Usar fake timers em testes unitarios e Toxiproxy nos testes de integracao. |
| Testes de performance dependem de maquina e rede | Alto | Definir ambiente controlado e registrar configuracao da execucao. |
| Retestes podem aumentar o esforco | Medio | Manter contingencia de 20% e automatizar os fluxos criticos. |

## 13. Conclusao

Com base na tecnica de Pontos de Caso de Teste adaptada, a funcionalidade de checkout exige **147 pontos de teste**, resultando em uma estimativa de **265 horas/homem** para planejamento, implementacao, execucao, validacao de resiliencia, testes de performance e documentacao final.

A estimativa reflete um componente de alta criticidade, com dependencia de gateway externo, persistencia de pedidos, envio de e-mail, tratamento de falhas e requisitos nao funcionais rigorosos para operacao em alto volume.
