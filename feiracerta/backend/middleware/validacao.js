const { validationResult } = require('express-validator');

function validar(req, res, next) {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).json({ erro: 'Dados inválidos', detalhes: erros.array() });
  }
  next();
}

function sanitizarTexto(str) {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/[<>]/g, '');
}

module.exports = { validar, sanitizarTexto };
