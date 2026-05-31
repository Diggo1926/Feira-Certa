const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validar, sanitizarTexto } = require('../middleware/validacao');
const db = require('../db/database');

// GET /api/categorias
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, nome FROM categorias ORDER BY nome ASC');
    res.json(rows);
  } catch (e) {
    console.error('[CATEGORIAS] GET:', e.message);
    res.status(500).json({ erro: 'Erro ao listar categorias' });
  }
});

// POST /api/categorias
router.post('/', [
  body('nome').isString().trim().notEmpty().withMessage('Nome obrigatório')
    .isLength({ max: 100 }).withMessage('Máximo 100 caracteres'),
  validar
], async (req, res) => {
  const nome = sanitizarTexto(req.body.nome);
  try {
    const { rows: [row] } = await db.query(
      'INSERT INTO categorias (nome) VALUES ($1) RETURNING id, nome',
      [nome]
    );
    res.status(201).json(row);
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ erro: 'Categoria já existe' });
    }
    console.error('[CATEGORIAS] POST:', e.message);
    res.status(500).json({ erro: 'Erro ao criar categoria' });
  }
});

// PUT /api/categorias/:id — renomeia e atualiza produtos vinculados em transação
router.put('/:id', [
  param('id').isInt({ min: 1 }).withMessage('ID inválido'),
  body('nome').isString().trim().notEmpty().withMessage('Nome obrigatório')
    .isLength({ max: 100 }).withMessage('Máximo 100 caracteres'),
  validar
], async (req, res) => {
  const id = parseInt(req.params.id);
  const nomeNovo = sanitizarTexto(req.body.nome);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [cat] } = await client.query(
      'SELECT nome FROM categorias WHERE id = $1', [id]
    );
    if (!cat) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Categoria não encontrada' });
    }
    await client.query('UPDATE categorias SET nome = $1 WHERE id = $2', [nomeNovo, id]);
    await client.query('UPDATE produtos SET categoria = $1 WHERE categoria = $2', [nomeNovo, cat.nome]);
    await client.query('COMMIT');
    res.json({ id, nome: nomeNovo });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') {
      return res.status(409).json({ erro: 'Já existe uma categoria com esse nome' });
    }
    console.error('[CATEGORIAS] PUT:', e.message);
    res.status(500).json({ erro: 'Erro ao renomear categoria' });
  } finally {
    client.release();
  }
});

// DELETE /api/categorias/:id — bloqueia com 409 se houver produtos vinculados
router.delete('/:id', [
  param('id').isInt({ min: 1 }).withMessage('ID inválido'),
  validar
], async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows: [cat] } = await db.query(
      'SELECT nome FROM categorias WHERE id = $1', [id]
    );
    if (!cat) return res.status(404).json({ erro: 'Categoria não encontrada' });

    const { rows: [{ count }] } = await db.query(
      'SELECT COUNT(*) FROM produtos WHERE categoria = $1', [cat.nome]
    );
    if (parseInt(count) > 0) {
      return res.status(409).json({
        erro: `Categoria em uso por ${count} produto(s) — remova ou reclassifique-os antes de excluir`
      });
    }

    await db.query('DELETE FROM categorias WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[CATEGORIAS] DELETE:', e.message);
    res.status(500).json({ erro: 'Erro ao excluir categoria' });
  }
});

module.exports = router;
