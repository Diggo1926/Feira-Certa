const crypto = require('crypto');

function validarAppToken(req, res, next) {
  const esperado = process.env.APP_SECRET_TOKEN;
  if (!esperado) {
    console.error('[SEGURANÇA] APP_SECRET_TOKEN não configurado');
    return res.status(503).json({ error: 'Serviço indisponível' });
  }

  const recebido = req.headers['x-app-token'];
  if (!recebido) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  // Garante buffers de mesmo tamanho antes de comparar (timingSafeEqual exige)
  const bufEsperado = Buffer.from(esperado);
  const bufRecebido = Buffer.alloc(bufEsperado.length);
  Buffer.from(recebido).copy(bufRecebido);

  const valido = recebido.length === esperado.length &&
    crypto.timingSafeEqual(bufEsperado, bufRecebido);

  if (!valido) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  next();
}

module.exports = validarAppToken;
