const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validar, sanitizarTexto } = require('../middleware/validacao');
const db = require('../db/database');
const axios = require('axios');

const MIMES_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];

router.post('/foto', [
  body('imagem').isString().notEmpty().withMessage('Imagem obrigatória'),
  body('mimeType').isIn(MIMES_PERMITIDOS).withMessage('Formato de imagem inválido (use JPEG, PNG ou WebP)'),
  validar
], async (req, res) => {
  const { imagem, mimeType } = req.body;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ erro: 'Gemini API não configurada no servidor' });

  const prompt = `Você está analisando um cupom fiscal brasileiro. Extraia todos os produtos listados e retorne APENAS um JSON válido, sem texto adicional, no seguinte formato:
{
  "produtos": [
    {
      "nome": "nome do produto",
      "quantidade": 1.0,
      "preco_unitario": 0.00,
      "preco_total": 0.00
    }
  ],
  "valor_total": 0.00,
  "data": "DD/MM/AAAA"
}
Normalize os nomes dos produtos: remova códigos de barras, abreviações excessivas e deixe o nome legível. Se não conseguir ler algum campo, use null.`;

  try {
    const { data: geminiData } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ inlineData: { mimeType, data: imagem } }, { text: prompt }] }]
      },
      { timeout: 30000 }
    );

    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const limpo = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const match = limpo.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(422).json({ erro: 'Não foi possível extrair os dados do cupom. Tente uma foto mais nítida e bem iluminada.' });
    }

    const dados = JSON.parse(match[0]);
    return res.json(dados);
  } catch (e) {
    if (e.response?.status === 400) return res.status(422).json({ erro: 'Imagem inválida ou ilegível pelo Gemini' });
    if (e.code === 'ECONNABORTED') return res.status(422).json({ erro: 'Tempo limite ao processar imagem. Tente novamente.' });
    return res.status(500).json({ erro: 'Erro ao processar imagem com IA' });
  }
});

router.post('/confirmar', [
  body('produtos').isArray({ min: 1 }),
  body('data').isISO8601(),
  validar
], async (req, res) => {
  const client = await db.connect();
  try {
    const { produtos, data, valor_total: valorTotalParam } = req.body;
    const valorTotal = valorTotalParam != null
      ? parseFloat(valorTotalParam)
      : produtos.reduce((s, p) => s + (p.preco_unitario * p.quantidade), 0);

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
