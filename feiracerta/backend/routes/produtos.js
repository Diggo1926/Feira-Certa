const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validar, sanitizarTexto } = require('../middleware/validacao');
const db = require('../db/database');

const validarProduto = [
  body('nome').trim().notEmpty().isLength({ max: 200 }),
  body('categoria').trim().notEmpty().isLength({ max: 100 }),
  body('unidade').trim().isIn(['Unidade', 'Kg', 'Litro', 'Pacote', 'Caixa', 'Lata', 'Garrafa']),
  body('quantidade_atual').isFloat({ min: 0 }),
  body('quantidade_minima').isFloat({ min: 0 }),
  body('preco').isFloat({ min: 0 }),
  body('marca').optional().trim().isLength({ max: 100 }),
  body('codigo_barras').optional().trim().isLength({ max: 50 }),
  validar
];

router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM produtos ORDER BY categoria, nome');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar produtos' });
  }
});

router.get('/buscar', async (req, res) => {
  try {
    const q = sanitizarTexto(req.query.q || '');
    const { rows } = await db.query(
      'SELECT * FROM produtos WHERE nome ILIKE $1 OR codigo_barras = $2 ORDER BY nome LIMIT 20',
      [`%${q}%`, q]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar produtos' });
  }
});

router.get('/categorias', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT DISTINCT categoria FROM produtos ORDER BY categoria');
    res.json(rows.map(r => r.categoria));
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar categorias' });
  }
});

router.get('/abaixo-minimo', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM produtos WHERE quantidade_atual < quantidade_minima ORDER BY categoria, nome'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar produtos' });
  }
});

router.get('/:id', [param('id').isInt({ min: 1 }), validar], async (req, res) => {
  try {
    const { rows: [produto] } = await db.query('SELECT * FROM produtos WHERE id = $1', [req.params.id]);
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });

    const { rows: historico } = await db.query(
      'SELECT preco, registrado_em FROM historico_precos WHERE produto_id = $1 ORDER BY registrado_em ASC LIMIT 50',
      [req.params.id]
    );

    res.json({ ...produto, historico_precos: historico });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar produto' });
  }
});

router.post('/', validarProduto, async (req, res) => {
  try {
    const { nome, categoria, unidade, quantidade_atual, quantidade_minima, preco, marca, codigo_barras } = req.body;

    if (codigo_barras) {
      const { rows } = await db.query('SELECT id FROM produtos WHERE codigo_barras = $1', [codigo_barras]);
      if (rows[0]) {
        return res.status(409).json({ erro: 'Produto com este código de barras já existe', id: rows[0].id });
      }
    }

    const { rows: [novo] } = await db.query(
      `INSERT INTO produtos (nome, categoria, unidade, quantidade_atual, quantidade_minima, preco, marca, codigo_barras)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        sanitizarTexto(nome), sanitizarTexto(categoria), unidade,
        quantidade_atual, quantidade_minima, preco,
        marca ? sanitizarTexto(marca) : null,
        codigo_barras ? sanitizarTexto(codigo_barras) : null
      ]
    );

    if (preco > 0) {
      await db.query('INSERT INTO historico_precos (produto_id, preco) VALUES ($1, $2)', [novo.id, preco]);
    }

    const { rows: [produto] } = await db.query('SELECT * FROM produtos WHERE id = $1', [novo.id]);
    res.status(201).json(produto);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao salvar produto' });
  }
});

router.put('/:id', [param('id').isInt({ min: 1 }), ...validarProduto], async (req, res) => {
  try {
    const { nome, categoria, unidade, quantidade_atual, quantidade_minima, preco, marca, codigo_barras } = req.body;
    const id = req.params.id;

    const { rows: [atual] } = await db.query('SELECT * FROM produtos WHERE id = $1', [id]);
    if (!atual) return res.status(404).json({ erro: 'Produto não encontrado' });

    if (codigo_barras && codigo_barras !== atual.codigo_barras) {
      const { rows } = await db.query('SELECT id FROM produtos WHERE codigo_barras = $1 AND id != $2', [codigo_barras, id]);
      if (rows[0]) {
        return res.status(409).json({ erro: 'Código de barras já usado por outro produto', id: rows[0].id });
      }
    }

    await db.query(
      `UPDATE produtos SET nome=$1, categoria=$2, unidade=$3, quantidade_atual=$4, quantidade_minima=$5,
       preco=$6, marca=$7, codigo_barras=$8, atualizado_em=NOW() WHERE id=$9`,
      [
        sanitizarTexto(nome), sanitizarTexto(categoria), unidade,
        quantidade_atual, quantidade_minima, preco,
        marca ? sanitizarTexto(marca) : null,
        codigo_barras ? sanitizarTexto(codigo_barras) : null,
        id
      ]
    );

    if (preco !== atual.preco) {
      await db.query('INSERT INTO historico_precos (produto_id, preco) VALUES ($1, $2)', [id, preco]);
    }

    const { rows: [produto] } = await db.query('SELECT * FROM produtos WHERE id = $1', [id]);
    res.json(produto);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao atualizar produto' });
  }
});

router.delete('/:id', [param('id').isInt({ min: 1 }), validar], async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id FROM produtos WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Produto não encontrado' });
    await db.query('DELETE FROM produtos WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao excluir produto' });
  }
});

// POST /excluir-lote — exclui vários produtos em uma transação
// historico_precos e registros_consumo têm ON DELETE CASCADE (excluídos automaticamente)
// itens_feira.produto_id tem ON DELETE SET NULL (histórico de feiras preservado)
router.post('/excluir-lote', [
  body('ids').isArray({ min: 1, max: 200 }).withMessage('ids deve ser array com 1 a 200 itens'),
  body('ids.*').isInt({ min: 1 }).withMessage('ids deve conter apenas inteiros positivos'),
  validar
], async (req, res) => {
  const { ids } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      'DELETE FROM produtos WHERE id = ANY($1::int[])',
      [ids]
    );
    await client.query('COMMIT');
    res.json({ excluidos: rowCount });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: 'Erro ao excluir produtos' });
  } finally {
    client.release();
  }
});

module.exports = router;
