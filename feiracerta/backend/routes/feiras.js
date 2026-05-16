const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validar } = require('../middleware/validacao');
const db = require('../db/database');

router.get('/', (req, res) => {
  try {
    const feiras = db.prepare(`
      SELECT f.*,
        (SELECT valor_total FROM feiras WHERE id < f.id ORDER BY id DESC LIMIT 1) as valor_anterior
      FROM feiras f ORDER BY f.data DESC
    `).all().map(f => ({
      ...f,
      variacao: f.valor_anterior
        ? Math.round(((f.valor_total - f.valor_anterior) / f.valor_anterior) * 100 * 10) / 10
        : null
    }));
    res.json(feiras);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar feiras' });
  }
});

router.get('/:id', [param('id').isInt({ min: 1 }), validar], (req, res) => {
  try {
    const feira = db.prepare('SELECT * FROM feiras WHERE id = ?').get(req.params.id);
    if (!feira) return res.status(404).json({ erro: 'Feira não encontrada' });

    const itens = db.prepare(`
      SELECT * FROM itens_feira WHERE feira_id = ? ORDER BY nome_produto
    `).all(req.params.id);

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
], (req, res) => {
  try {
    const { data, valor_total, itens } = req.body;

    const registrar = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO feiras (data, valor_total) VALUES (?, ?)
      `).run(data, valor_total);

      const feiraId = result.lastInsertRowid;

      for (const item of itens) {
        if (!item.nome_produto || typeof item.quantidade !== 'number' || typeof item.preco_unitario !== 'number') continue;
        db.prepare(`
          INSERT INTO itens_feira (feira_id, produto_id, nome_produto, quantidade, preco_unitario)
          VALUES (?, ?, ?, ?, ?)
        `).run(feiraId, item.produto_id || null, String(item.nome_produto).slice(0, 200), item.quantidade, item.preco_unitario);
      }

      db.prepare('DELETE FROM itens_lista_manual WHERE marcado = 1').run();

      return feiraId;
    });

    const feiraId = registrar();
    res.status(201).json({ id: feiraId, ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao registrar feira' });
  }
});

router.get('/stats/gasto-categoria', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT p.categoria,
             ROUND(AVG(if_total.total), 2) as media_mensal
      FROM (
        SELECT produto_id, SUM(quantidade * preco_unitario) as total, feira_id
        FROM itens_feira WHERE produto_id IS NOT NULL
        GROUP BY produto_id, feira_id
      ) if_total
      JOIN produtos p ON p.id = if_total.produto_id
      GROUP BY p.categoria
      ORDER BY media_mensal DESC
    `).all();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao calcular gastos' });
  }
});

module.exports = router;
