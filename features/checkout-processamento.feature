# language: pt
Funcionalidade: Processamento de checkout
  Como cliente da plataforma EntregasJa
  Quero finalizar um pedido com pagamento por cartao
  Para receber a confirmacao quando a cobranca for aprovada

  Contexto:
    Dado que o endpoint de checkout e "/api/v1/checkout"
    E que existe um repositorio de pedidos disponivel
    E que existe um servico de e-mail disponivel

  Cenario: Pagamento aprovado com sucesso
    Dado que o cliente informa um pedido valido
    E que o gateway de pagamento retornara "APROVADO"
    Quando o cliente enviar a solicitacao de checkout
    Entao o sistema deve cobrar o valor do pedido no gateway de pagamento
    E o pedido deve ser salvo com status "PROCESSADO"
    E o sistema deve solicitar o envio do e-mail de confirmacao "Pagamento Aprovado"
    E a resposta HTTP deve ter status 200
    E a resposta deve informar "Pedido finalizado com sucesso!"

  Cenario: Cartao recusado pelo gateway de pagamento
    Dado que o cliente informa um pedido valido
    E que o gateway de pagamento retornara "RECUSADO"
    Quando o cliente enviar a solicitacao de checkout
    Entao o sistema deve cobrar o valor do pedido no gateway de pagamento
    E o pedido deve ser salvo com status "FALHOU"
    E o sistema nao deve solicitar envio de e-mail de confirmacao
    E a resposta HTTP deve ter status 500
    E a resposta deve informar "Nao foi possivel processar seu pagamento. Tente mais tarde."

  Cenario: Payload incompleto deve ser rejeitado antes da cobranca
    Dado que o cliente nao informa todos os dados obrigatorios do checkout
    Quando o cliente enviar a solicitacao de checkout
    Entao o sistema nao deve chamar o gateway de pagamento
    E o sistema nao deve salvar o pedido no repositorio
    E o sistema nao deve solicitar envio de e-mail de confirmacao
    E a resposta HTTP deve ter status 400
    E a resposta deve informar "Dados incompletos para checkout"

