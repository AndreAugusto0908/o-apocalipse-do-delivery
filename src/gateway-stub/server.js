// Stub do gateway de pagamento parceiro (servico externo).
// No docker-compose, a aplicacao NAO fala direto com ele: as chamadas passam
// pelo Toxiproxy, que injeta latencia/queda na rede para os experimentos de caos.
const express = require('express');

const app = express();
app.use(express.json({ limit: '16kb' }));

const processadas = new Map();

app.post('/cobrar', (req, res) => {
  const idempotencyKey = req.header('Idempotency-Key');

  if (idempotencyKey && processadas.has(idempotencyKey)) {
    return res.json(processadas.get(idempotencyKey));
  }

  const resultado = { status: 'APROVADO' };

  if (idempotencyKey) {
    processadas.set(idempotencyKey, resultado);
  }

  return res.json(resultado);
});

app.get('/health', (req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT || 9000);
app.listen(port, () => console.log(`Gateway-stub parceiro na porta ${port}`));
