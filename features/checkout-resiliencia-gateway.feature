# language: pt
Funcionalidade: Resiliencia do checkout contra falhas do gateway
  Como operador da plataforma EntregasJa
  Quero que o checkout trate falhas do gateway de pagamento de forma controlada
  Para preservar a estabilidade do sistema em periodos de alto trafego

  Contexto:
    Dado que o endpoint de checkout e "/api/v1/checkout"
    E que o tempo limite de resposta do gateway e 2000 milissegundos
    E que a politica de retentativa permite ate 3 novas tentativas
    E que o intervalo de backoff entre tentativas e 500 milissegundos

  Cenario: Gateway excede o timeout operacional
    Dado que o cliente informa um pedido valido
    E que o gateway de pagamento nao responde em ate 2000 milissegundos
    Quando o cliente enviar a solicitacao de checkout
    Entao o sistema deve interromper a chamada ao gateway por timeout
    E o sistema deve executar a politica de retentativa configurada
    E apos esgotar as retentativas o pedido deve ser salvo com status "ERRO_GATEWAY"
    E o sistema nao deve solicitar envio de e-mail de confirmacao
    E a resposta HTTP deve ter status 500
    E a resposta deve informar "Nao foi possivel processar seu pagamento. Tente mais tarde."

  Cenario: Erro transitorio de infraestrutura recuperado por retry
    Dado que o cliente informa um pedido valido
    E que a primeira chamada ao gateway de pagamento falhara por erro de infraestrutura
    E que a segunda chamada ao gateway de pagamento retornara "APROVADO"
    Quando o cliente enviar a solicitacao de checkout
    Entao o sistema deve tentar a cobranca novamente apos o backoff de 500 milissegundos
    E o pedido deve ser salvo com status "PROCESSADO"
    E o sistema deve solicitar o envio do e-mail de confirmacao "Pagamento Aprovado"
    E a resposta HTTP deve ter status 200
    E a resposta deve informar "Pedido finalizado com sucesso!"

  Cenario: Erro persistente de infraestrutura esgota as retentativas
    Dado que o cliente informa um pedido valido
    E que todas as chamadas ao gateway de pagamento falharao por erro de infraestrutura
    Quando o cliente enviar a solicitacao de checkout
    Entao o sistema deve realizar a tentativa inicial de cobranca
    E o sistema deve realizar ate 3 retentativas adicionais
    E o sistema deve respeitar o backoff de 500 milissegundos entre as retentativas
    E o pedido deve ser salvo com status "ERRO_GATEWAY"
    E o sistema nao deve solicitar envio de e-mail de confirmacao
    E a resposta HTTP deve ter status 500
    E a resposta deve informar "Nao foi possivel processar seu pagamento. Tente mais tarde."

  Cenario: Circuit breaker aberto impede nova chamada ao gateway
    Dado que o cliente informa um pedido valido
    E que o circuit breaker do gateway de pagamento esta aberto
    Quando o cliente enviar a solicitacao de checkout
    Entao o sistema nao deve chamar o gateway de pagamento
    E o pedido deve ser salvo com status "ERRO_GATEWAY"
    E o sistema nao deve solicitar envio de e-mail de confirmacao
    E a resposta HTTP deve ter status 500
    E a resposta deve informar "Nao foi possivel processar seu pagamento. Tente mais tarde."

