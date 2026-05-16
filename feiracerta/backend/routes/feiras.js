const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validar } = require('../middleware/validacao');
const db = require('../db/database');

router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT f.*,
        (SELECT valor_total FROM feiras WHERE id < f.id ORDER BY id DESC LIMIT 1) as valor_anterior
      FROM feiras f ORDER BY f.data DESC
    `);
    res.json(rows.map(f => ({
      ...f,
      variacao: f.valor_anterior
        ? Math.round(((f.valor_total - f.valor_anterior) / f.valor_anterior) * 100 * 10) / 10
        : null
    })));
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar feiras' });
  }
});

router.get('/:id', [param('id').isInt({ min: 1 }), validar], async (req, res) => {
  try {
    const { rows: [feira] } = await db.query('SELECT * FROM feiras WHERE id = $1', [req.params.id]);
    if (!feira) return res.status(404).json({ erro: 'Feira não encontrada' });

    const { rows: itens } = await db.query(
      'SELECT * FROM itens_feira WHERE feira_id = $1 ORDER BY nome_produto',
      [req.params.id]
    );

    res.json({ ...feira, itens });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar feira' });
  }
});

router.post('/registrar', [
  body('data').isISO8601(),
  body('valor_total').isFloat({ min: 0 }),
  body('itens').isArray(),
  validar
], async (req, res) => {
  const client = await db.connect();
  try {
    const { data, valor_total, itens } = req.body;

    await client.query('BEGIN');

    const { rows: [feiraRow] } = await client.query(
      'INSERT INTO feiras (data, valor_total) VALUES ($1, $2) RETURNING id',
      [data, valor_total]
    );
    const feiraId = feiraRow.id;

    for (const item of itens) {
      if (!item.nome_produto || typeof item.quantidade !== 'number' || typeof item.preco_unitario !== 'number') continue;
      await client.query(
        'INSERT INTO itens_feira (feira_id, produto_id, nome_produto, quantidade, preco_unitario) VALUES ($1, $2, $3, $4, $5)',
        [feiraId, item.produto_id || null, String(item.nome_produto).slice(0, 200), item.quantidade, item.preco_unitario]
      );
    }

    await client.query('DELETE FROM itens_lista_manual WHERE marcado = 1');

    await client.query('COMMIT');
    res.status(201).json({ id: feiraId, ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: 'Erro ao registrar feira' });
  } finally {
    client.release();
  }
});

router.get('/stats/gasto-categoria', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.categoria,
             ROUND(AVG(if_total.total)::numeric, 2) as media_mensal
      FROM (
        SELECT produto_id, SUM(quantidade * preco_unitario) as total, feira_id
        FROM itens_feira WHERE produto_id IS NOT NULL
        GROUP BY produto_id, feira_id
      ) if_total
      JOIN produtos p ON p.id = if_total.produto_id
      GROUP BY p.categoria
      ORDER BY media_mensal DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao calcular gastos' });
  }
});

module.exports = router;
