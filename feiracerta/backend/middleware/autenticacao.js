const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    if (payload.tipo !== 'access') throw new Error();
    next();
  } catch {
    return res.status(401).json({ erro: 'Não autorizado' });
  }
}

module.exports = autenticar;
