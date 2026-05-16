const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validar } = require('../middleware/validacao');
const db = require('../db/database');

router.post('/registrar', [
  body('produto_id').isInt({ min: 1 }),
  body('quantidade_nova').isFloat({ min: 0 }),
  validar
], async (req, res) => {
  try {
    const { produto_id, quantidade_nova } = req.body;
    const { rows: [produto] } = await db.query('SELECT * FROM produtos WHERE id = $1', [produto_id]);
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });

    const anterior = produto.quantidade_atual;

    await db.query(
      'UPDATE produtos SET quantidade_atual = $1, atualizado_em = NOW() WHERE id = $2',
      [quantidade_nova, produto_id]
    );

    await db.query(
      'INSERT INTO registros_consumo (produto_id, quantidade_anterior, quantidade_nova) VALUES ($1, $2, $3)',
      [produto_id, anterior, quantidade_nova]
    );

    const { rows: [atualizado] } = await db.query('SELECT * FROM produtos WHERE id = $1', [produto_id]);
    res.json({ ok: true, produto: atualizado });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao registrar consumo' });
  }
});

router.get('/previsao/:id', [param('id').isInt({ min: 1 }), validar], async (req, res) => {
  try {
    const { rows: registros } = await db.query(
      `SELECT quantidade_anterior, quantidade_nova, registrado_em FROM registros_consumo
       WHERE produto_id = $1 ORDER BY registrado_em DESC LIMIT 30`,
      [req.params.id]
    );

    if (registros.length < 2) {
      return res.json({ consumo_medio_mensal: null, sugestao_quantidade: null });
    }

    let totalConsumido = 0;
    let diasTotais = 0;

    for (let i = 0; i < registros.length - 1; i++) {
      const consumo = registros[i].quantidade_anterior - registros[i].quantidade_nova;
      if (consumo > 0) {
        const d1 = new Date(registros[i].registrado_em);
        const d2 = new Date(registros[i + 1].registrado_em);
        const dias = Math.abs((d1 - d2) / (1000 * 60 * 60 * 24)) || 1;
        totalConsumido += consumo;
        diasTotais += dias;
      }
    }

    const consumoDiario = diasTotais > 0 ? totalConsumido / diasTotais : 0;
    const consumoMensal = Math.round(consumoDiario * 30 * 10) / 10;
    const sugestao = Math.ceil(consumoMensal * 1.1);

    res.json({ consumo_medio_mensal: consumoMensal, sugestao_quantidade: sugestao });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao calcular previsão' });
  }
});

module.exports = router;
