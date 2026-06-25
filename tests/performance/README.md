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
