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

router.get('/', (req, res) => {
  try {
    const produtos = db.prepare(`
      SELECT * FROM produtos ORDER BY categoria, nome
    `).all();
    res.json(produtos);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar produtos' });
  }
});

router.get('/buscar', (req, res) => {
  try {
    const q = sanitizarTexto(req.query.q || '');
    const produtos = db.prepare(`
      SELECT * FROM produtos
      WHERE nome LIKE ? OR codigo_barras = ?
      ORDER BY nome LIMIT 20
    `).all(`%${q}%`, q);
    res.json(produtos);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar produtos' });
  }
});

router.get('/categorias', (req, res) => {
  try {
    const cats = db.prepare(`
      SELECT DISTINCT categoria FROM produtos ORDER BY categoria
    `).all().map(r => r.categoria);
    res.json(cats);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar categorias' });
  }
});

router.get('/abaixo-minimo', (req, res) => {
  try {
    const produtos = db.prepare(`
      SELECT * FROM produtos WHERE quantidade_atual < quantidade_minima ORDER BY categoria, nome
    `).all();
    res.json(produtos);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar produtos' });
  }
});

router.get('/:id', [param('id').isInt({ min: 1 }), validar], (req, res) => {
  try {
    const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(req.params.id);
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });

    const historico = db.prepare(`
      SELECT preco, registrado_em FROM historico_precos
      WHERE produto_id = ? ORDER BY registrado_em ASC LIMIT 50
    `).all(req.params.id);

    res.json({ ...produto, historico_precos: historico });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar produto' });
  }
});

router.post('/', validarProduto, (req, res) => {
  try {
    const { nome, categoria, unidade, quantidade_atual, quantidade_minima, preco, marca, codigo_barras } = req.body;

    if (codigo_barras) {
      const existente = db.prepare('SELECT id FROM produtos WHERE codigo_barras = ?').get(codigo_barras);
      if (existente) {
        return res.status(409).json({ erro: 'Produto com este código de barras já existe', id: existente.id });
      }
    }

    const result = db.prepare(`
      INSERT INTO produtos (nome, categoria, unidade, quantidade_atual, quantidade_minima, preco, marca, codigo_barras)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sanitizarTexto(nome), sanitizarTexto(categoria), unidade,
      quantidade_atual, quantidade_minima, preco,
      marca ? sanitizarTexto(marca) : null,
      codigo_barras ? sanitizarTexto(codigo_barras) : null
    );

    if (preco > 0) {
      db.prepare('INSERT INTO historico_precos (produto_id, preco) VALUES (?, ?)').run(result.lastInsertRowid, preco);
    }

    const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(produto);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao salvar produto' });
  }
});

router.put('/:id', [param('id').isInt({ min: 1 }), ...validarProduto], (req, res) => {
  try {
    const { nome, categoria, unidade, quantidade_atual, quantidade_minima, preco, marca, codigo_barras } = req.body;
    const id = req.params.id;

    const atual = db.prepare('SELECT * FROM produtos WHERE id = ?').get(id);
    if (!atual) return res.status(404).json({ erro: 'Produto não encontrado' });

    if (codigo_barras && codigo_barras !== atual.codigo_barras) {
      const existente = db.prepare('SELECT id FROM produtos WHERE codigo_barras = ? AND id != ?').get(codigo_barras, id);
      if (existente) {
        return res.status(409).json({ erro: 'Código de barras já usado por outro produto', id: existente.id });
      }
    }

    db.prepare(`
      UPDATE produtos SET nome=?, categoria=?, unidade=?, quantidade_atual=?, quantidade_minima=?,
      preco=?, marca=?, codigo_barras=?, atualizado_em=datetime('now','localtime') WHERE id=?
    `).run(
      sanitizarTexto(nome), sanitizarTexto(categoria), unidade,
      quantidade_atual, quantidade_minima, preco,
      marca ? sanitizarTexto(marca) : null,
      codigo_barras ? sanitizarTexto(codigo_barras) : null,
      id
    );

    if (preco !== atual.preco) {
      db.prepare('INSERT INTO historico_precos (produto_id, preco) VALUES (?, ?)').run(id, preco);
    }

    res.json(db.prepare('SELECT * FROM produtos WHERE id = ?').get(id));
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao atualizar produto' });
  }
});

router.delete('/:id', [param('id').isInt({ min: 1 }), validar], (req, res) => {
  try {
    const produto = db.prepare('SELECT id FROM produtos WHERE id = ?').get(req.params.id);
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });
    db.prepare('DELETE FROM produtos WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao excluir produto' });
  }
});

module.exports = router;
