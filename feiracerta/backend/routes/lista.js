const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validar, sanitizarTexto } = require('../middleware/validacao');
const db = require('../db/database');
const PDFDocument = require('pdfkit');

router.get('/', (req, res) => {
  try {
    const automaticos = db.prepare(`
      SELECT p.id, p.nome, p.categoria, p.unidade, p.preco,
             p.quantidade_atual, p.quantidade_minima,
             (p.quantidade_minima - p.quantidade_atual) as quantidade_sugerida,
             0 as marcado, 'auto' as tipo
      FROM produtos p
      WHERE p.quantidade_atual < p.quantidade_minima
      ORDER BY p.categoria, p.nome
    `).all();

    const manuais = db.prepare(`
      SELECT id, nome, quantidade, marcado, 'manual' as tipo FROM itens_lista_manual ORDER BY criado_em
    `).all();

    res.json({ automaticos, manuais });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar lista' });
  }
});

router.post('/manual', [
  body('nome').trim().notEmpty().isLength({ max: 200 }),
  body('quantidade').trim().notEmpty().isLength({ max: 50 }),
  validar
], (req, res) => {
  try {
    const { nome, quantidade } = req.body;
    const result = db.prepare(`
      INSERT INTO itens_lista_manual (nome, quantidade) VALUES (?, ?)
    `).run(sanitizarTexto(nome), sanitizarTexto(quantidade));
    res.status(201).json({ id: result.lastInsertRowid, nome, quantidade, marcado: 0 });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao adicionar item' });
  }
});

router.put('/manual/:id/marcar', [param('id').isInt({ min: 1 }), validar], (req, res) => {
  try {
    const item = db.prepare('SELECT id, marcado FROM itens_lista_manual WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
    const novoEstado = item.marcado ? 0 : 1;
    db.prepare('UPDATE itens_lista_manual SET marcado = ? WHERE id = ?').run(novoEstado, req.params.id);
    res.json({ ok: true, marcado: novoEstado });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao marcar item' });
  }
});

router.delete('/manual/:id', [param('id').isInt({ min: 1 }), validar], (req, res) => {
  try {
    db.prepare('DELETE FROM itens_lista_manual WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao remover item' });
  }
});

router.get('/pdf', (req, res) => {
  try {
    const automaticos = db.prepare(`
      SELECT p.nome, p.unidade, (p.quantidade_minima - p.quantidade_atual) as qtd, p.preco
      FROM produtos p WHERE p.quantidade_atual < p.quantidade_minima ORDER BY p.nome
    `).all();

    const manuais = db.prepare(`
      SELECT nome, quantidade FROM itens_lista_manual ORDER BY criado_em
    `).all();

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="lista-compras.pdf"');
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(20).text('Lista de Compras — FeiraCerta', { align: 'center' });
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
