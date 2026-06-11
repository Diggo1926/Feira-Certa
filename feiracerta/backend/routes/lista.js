const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validar, sanitizarTexto } = require('../middleware/validacao');
const db = require('../db/database');
const PDFDocument = require('pdfkit');

router.get('/', async (req, res) => {
  try {
    const { rows: automaticos } = await db.query(`
      SELECT p.id, p.nome, p.categoria, p.unidade, p.preco,
             p.quantidade_atual, p.quantidade_minima,
             (p.quantidade_minima - p.quantidade_atual) as quantidade_sugerida,
             0 as marcado, 'auto' as tipo
      FROM produtos p
      WHERE p.quantidade_atual < p.quantidade_minima
      ORDER BY p.categoria, p.nome
    `);

    const { rows: manuais } = await db.query(
      `SELECT id, nome, quantidade, marcado, 'manual' as tipo FROM itens_lista_manual ORDER BY criado_em`
    );

    res.json({ automaticos, manuais });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar lista' });
  }
});

router.post('/manual', [
  body('nome').trim().notEmpty().isLength({ max: 200 }),
  body('quantidade').trim().notEmpty().isLength({ max: 50 }),
  validar
], async (req, res) => {
  try {
    const { nome, quantidade } = req.body;
    const { rows: [novo] } = await db.query(
      'INSERT INTO itens_lista_manual (nome, quantidade) VALUES ($1, $2) RETURNING id',
      [sanitizarTexto(nome), sanitizarTexto(quantidade)]
    );
    res.status(201).json({ id: novo.id, nome, quantidade, marcado: 0 });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao adicionar item' });
  }
});

router.put('/manual/:id/marcar', [param('id').isInt({ min: 1 }), validar], async (req, res) => {
  try {
    const { rows: [item] } = await db.query(
      'SELECT id, marcado FROM itens_lista_manual WHERE id = $1',
      [req.params.id]
    );
    if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
    const novoEstado = item.marcado ? 0 : 1;
    await db.query('UPDATE itens_lista_manual SET marcado = $1 WHERE id = $2', [novoEstado, req.params.id]);
    res.json({ ok: true, marcado: novoEstado });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao marcar item' });
  }
});

router.delete('/manual/:id', [param('id').isInt({ min: 1 }), validar], async (req, res) => {
  try {
    await db.query('DELETE FROM itens_lista_manual WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao remover item' });
  }
});

// POST /excluir-lote — exclui itens manuais e/ou produtos do estoque em uma transação
router.post('/excluir-lote', [
  body('manuais').optional().isArray({ max: 200 }),
  body('manuais.*').optional({ nullable: true }).isInt({ min: 1 }),
  body('produtos').optional().isArray({ max: 200 }),
  body('produtos.*').optional({ nullable: true }).isInt({ min: 1 }),
  validar
], async (req, res) => {
  const manuais = Array.isArray(req.body.manuais) ? req.body.manuais : [];
  const produtos = Array.isArray(req.body.produtos) ? req.body.produtos : [];

  if (manuais.length + produtos.length === 0) {
    return res.status(400).json({ erro: 'Informe ao menos um item para excluir' });
  }
  if (manuais.length + produtos.length > 200) {
    return res.status(400).json({ erro: 'Máximo de 200 itens por operação' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let manuaisExcluidos = 0;
    let produtosExcluidos = 0;

    if (manuais.length > 0) {
      const { rowCount } = await client.query(
        'DELETE FROM itens_lista_manual WHERE id = ANY($1::int[])',
        [manuais]
      );
      manuaisExcluidos = rowCount;
    }

    if (produtos.length > 0) {
      const { rowCount } = await client.query(
        'DELETE FROM produtos WHERE id = ANY($1::int[])',
        [produtos]
      );
      produtosExcluidos = rowCount;
    }

    await client.query('COMMIT');
    res.json({ manuais_excluidos: manuaisExcluidos, produtos_excluidos: produtosExcluidos });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: 'Erro ao excluir itens' });
  } finally {
    client.release();
  }
});

router.get('/pdf', async (req, res) => {
  try {
    const { rows: automaticos } = await db.query(`
      SELECT p.nome, p.unidade, (p.quantidade_minima - p.quantidade_atual) as qtd, p.preco
      FROM produtos p WHERE p.quantidade_atual < p.quantidade_minima ORDER BY p.nome
    `);

    const { rows: manuais } = await db.query(
      'SELECT nome, quantidade FROM itens_lista_manual ORDER BY criado_em'
    );

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="lista-compras.pdf"');
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(20).text('Lista de Compras — Feira-Certa', { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10).fillColor('#7A6A5A')
       .text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, { align: 'center' });
    doc.moveDown(1);

    const totalAuto = automaticos.reduce((s, i) => s + (i.qtd * i.preco), 0);

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#C9956E')
       .text(`Total estimado: R$ ${totalAuto.toFixed(2)}`, { align: 'right' });
    doc.moveDown(1);

    if (automaticos.length > 0) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#6A8C5F').text('Itens do Estoque:');
      doc.moveDown(0.5);
      automaticos.forEach(item => {
        doc.font('Helvetica').fontSize(11).fillColor('#3D3530')
           .text(`• ${item.nome} — ${Math.ceil(item.qtd)} ${item.unidade} (est. R$ ${(Math.ceil(item.qtd) * item.preco).toFixed(2)})`);
      });
      doc.moveDown(1);
    }

    if (manuais.length > 0) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#6A8C5F').text('Itens Adicionais:');
      doc.moveDown(0.5);
      manuais.forEach(item => {
        doc.font('Helvetica').fontSize(11).fillColor('#3D3530')
           .text(`• ${item.nome} — ${item.quantidade}`);
      });
    }

    doc.end();
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao gerar PDF' });
  }
});

module.exports = router;
