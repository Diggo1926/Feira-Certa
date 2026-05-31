const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body } = require('express-validator');
const { validar } = require('../middleware/validacao');
const db = require('../db/database');
const rateLimit = require('express-rate-limit');

const limiterLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.' }
});

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function gerarAccessToken() {
  return jwt.sign({ tipo: 'access' }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

function gerarRefreshToken() {
  return jwt.sign({ tipo: 'refresh' }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/login
router.post('/login', limiterLogin, [
  body('senha').isString().notEmpty().withMessage('Senha obrigatória'),
  validar
], async (req, res) => {
  try {
    const hash = process.env.APP_PASSWORD_HASH;
    if (!hash || !process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
      console.error('[AUTH] Variáveis APP_PASSWORD_HASH, JWT_ACCESS_SECRET ou JWT_REFRESH_SECRET não configuradas');
      return res.status(503).json({ erro: 'Serviço de autenticação indisponível' });
    }

    const valida = await bcrypt.compare(req.body.senha, hash);
    if (!valida) {
      return res.status(401).json({ erro: 'Senha incorreta' });
    }

    const accessToken = gerarAccessToken();
    const refreshToken = gerarRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.query(
      'INSERT INTO refresh_tokens (token_hash, expires_at) VALUES ($1, $2)',
      [hashToken(refreshToken), expiresAt]
    );

    res.json({ access_token: accessToken, refresh_token: refreshToken, expires_in: 900 });
  } catch (e) {
    console.error('[AUTH] Erro no login:', e.message);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', [
  body('refresh_token').isString().notEmpty().withMessage('Token obrigatório'),
  validar
], async (req, res) => {
  try {
    let payload;
    try {
      payload = jwt.verify(req.body.refresh_token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ erro: 'Token inválido ou expirado' });
    }

    if (payload.tipo !== 'refresh') {
      return res.status(401).json({ erro: 'Token inválido' });
    }

    const { rows: [row] } = await db.query(
      'SELECT id FROM refresh_tokens WHERE token_hash = $1 AND expires_at > NOW()',
      [hashToken(req.body.refresh_token)]
    );

    if (!row) return res.status(401).json({ erro: 'Token revogado ou expirado' });

    res.json({ access_token: gerarAccessToken(), expires_in: 900 });
  } catch (e) {
    console.error('[AUTH] Erro no refresh:', e.message);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/auth/logout
router.post('/logout', [
  body('refresh_token').isString().notEmpty().withMessage('Token obrigatório'),
  validar
], async (req, res) => {
  try {
    await db.query(
      'DELETE FROM refresh_tokens WHERE token_hash = $1',
      [hashToken(req.body.refresh_token)]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[AUTH] Erro no logout:', e.message);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

module.exports = router;
