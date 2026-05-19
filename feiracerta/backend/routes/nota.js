const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validar, sanitizarTexto } = require('../middleware/validacao');
const db = require('../db/database');

router.post('/confirmar', [
  body('produtos').isArray({ min: 1 }),
  body('data').isISO8601(),
  validar
], async (req, res) => {
  const client = await db.connect();
  try {
    const { produtos, data } = req.body;
    const valorTotal = produtos.reduce((s, p) => s + (p.preco_unitario * p.quantidade), 0);

    await client.query('BEGIN');

    const { rows: [feiraRow] } = await client.query(
      'INSERT INTO feiras (data, valor_total) VALUES ($1, $2) RETURNING id',
      [data, valorTotal]
    );
    const feiraId = feiraRow.id;

    for (const p of produtos) {
      if (!p.nome || typeof p.quantidade !== 'number') continue;

      let produtoId = p.produto_id || null;

      if (produtoId) {
        const { rows: [prod] } = await client.query('SELECT * FROM produtos WHERE id = $1', [produtoId]);
        if (prod) {
          const novaQtd = prod.quantidade_atual + p.quantidade;
          await client.query(
            'UPDATE produtos SET quantidade_atual = $1, preco = $2, atualizado_em = NOW() WHERE id = $3',
            [novaQtd, p.preco_unitario, produtoId]
          );
          if (p.preco_unitario !== prod.preco) {
            await client.query(
              'INSERT INTO historico_precos (produto_id, preco) VALUES ($1, $2)',
              [produtoId, p.preco_unitario]
            );
          }
        }
      } else if (p.cadastrar && p.categoria) {
        const { rows: [novo] } = await client.query(
          `INSERT INTO produtos (nome, categoria, unidade, quantidade_atual, quantidade_minima, preco)
           VALUES ($1, $2, 'Unidade', $3, $4, $5) RETURNING id`,
          [sanitizarTexto(p.nome), sanitizarTexto(p.categoria), p.quantidade, p.quantidade_minima || 1, p.preco_unitario]
        );
        produtoId = novo.id;
        await client.query(
          'INSERT INTO historico_precos (produto_id, preco) VALUES ($1, $2)',
          [produtoId, p.preco_unitario]
        );
      }

      await client.query(
        'INSERT INTO itens_feira (feira_id, produto_id, nome_produto, quantidade, preco_unitario) VALUES ($1, $2, $3, $4, $5)',
        [feiraId, produtoId, String(p.nome).slice(0, 200), p.quantidade, p.preco_unitario]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, feira_id: feiraId });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: 'Erro ao confirmar feira' });
  } finally {
    client.release();
  }
});

module.exports = router;
