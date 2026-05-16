const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validar, sanitizarTexto } = require('../middleware/validacao');
const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../db/database');

const SEFAZ_TIMEOUT = 15000;
const MAX_RETRIES = 3;

async function fetchComRetry(url, tentativas = MAX_RETRIES) {
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < tentativas; i++) {
    try {
      const resp = await axios.get(url, {
        timeout: SEFAZ_TIMEOUT,
        headers: { 'User-Agent': 'Mozilla/5.0 FeiraCerta/1.0' },
        maxRedirects: 5
      });
      return resp.data;
    } catch (e) {
      if (i === tentativas - 1) throw e;
      await delay(1000 * (i + 1));
    }
  }
}

function parsearNFe(html) {
  const $ = cheerio.load(html);
  const produtos = [];

  $('table tr, .item, [class*="item"]').each((_, el) => {
    const texto = $(el).text().trim();
    if (!texto) return;
  });

  // Padrão SEFAZ-SE: tabela de produtos
  $('table').each((_, tabela) => {
    $(tabela).find('tr').each((i, tr) => {
      if (i === 0) return; // header
      const tds = $(tr).find('td');
      if (tds.length >= 4) {
        const nome = $(tds[0]).text().trim();
        const qtd = parseFloat($(tds[1]).text().replace(',', '.')) || 0;
        const preco = parseFloat($(tds[2]).text().replace('R$', '').replace('.', '').replace(',', '.').trim()) || 0;

        if (nome && qtd > 0) {
          produtos.push({ nome: sanitizarTexto(nome), quantidade: qtd, preco_unitario: preco });
        }
      }
    });
  });

  // Fallback: busca padrão alternativo
  if (produtos.length === 0) {
    $('[id*="produto"], [class*="produto"], [id*="item"], [class*="item"]').each((_, el) => {
      const nome = $(el).find('[class*="nome"], [class*="desc"]').first().text().trim();
      const qtdTxt = $(el).find('[class*="qtd"], [class*="quant"]').first().text().trim();
      const precoTxt = $(el).find('[class*="preco"], [class*="valor"]').first().text().trim();

      const qtd = parseFloat(qtdTxt.replace(',', '.')) || 0;
      const preco = parseFloat(precoTxt.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;

      if (nome && qtd > 0) {
        produtos.push({ nome: sanitizarTexto(nome), quantidade: qtd, preco_unitario: preco });
      }
    });
  }

  return produtos;
}

router.post('/processar', [
  body('url').isURL({ protocols: ['http', 'https'], require_protocol: true }),
  validar
], async (req, res) => {
  try {
    const { url } = req.body;

    // Validar que a URL é da SEFAZ
    const urlObj = new URL(url);
    const dominiosPermitidos = ['nfce.sefaz.se.gov.br', 'www.sefaz.se.gov.br', 'nfe.fazenda.gov.br'];
    if (!dominiosPermitidos.some(d => urlObj.hostname.endsWith(d))) {
      return res.status(400).json({ erro: 'URL deve ser da SEFAZ-SE' });
    }

    const html = await fetchComRetry(url);
    const produtos = parsearNFe(html);

    if (produtos.length === 0) {
      return res.status(422).json({ erro: 'Não foi possível extrair produtos desta nota. Tente o registro manual.' });
    }

    // Cruzar com estoque
    const resultado = produtos.map(p => {
      const existente = db.prepare(`
        SELECT * FROM produtos WHERE LOWER(nome) = LOWER(?) OR LOWER(nome) LIKE LOWER(?)
      `).get(p.nome, `%${p.nome.split(' ')[0]}%`);

      return {
        ...p,
        produto_existente: existente || null,
        novo: !existente
      };
    });

    res.json({ produtos: resultado, total: produtos.reduce((s, p) => s + p.preco_unitario * p.quantidade, 0) });
  } catch (e) {
    if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
      return res.status(504).json({ erro: 'SEFAZ-SE demorou para responder. Tente novamente.' });
    }
    if (e.response?.status === 404) {
      return res.status(404).json({ erro: 'Nota fiscal não encontrada na SEFAZ-SE.' });
    }
    res.status(502).json({ erro: 'Não foi possível acessar a SEFAZ-SE. Tente mais tarde ou registre manualmente.' });
  }
});

router.post('/confirmar', [
  body('produtos').isArray({ min: 1 }),
  body('data').isISO8601(),
  validar
], (req, res) => {
  try {
    const { produtos, data } = req.body;
    const valorTotal = produtos.reduce((s, p) => s + (p.preco_unitario * p.quantidade), 0);

    const processar = db.transaction(() => {
      const feiraResult = db.prepare('INSERT INTO feiras (data, valor_total) VALUES (?, ?)').run(data, valorTotal);
      const feiraId = feiraResult.lastInsertRowid;

      for (const p of produtos) {
        if (!p.nome || typeof p.quantidade !== 'number') continue;

        let produtoId = p.produto_id || null;

        if (produtoId) {
          const prod = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produtoId);
          if (prod) {
            const novaQtd = prod.quantidade_atual + p.quantidade;
            db.prepare(`
              UPDATE produtos SET quantidade_atual = ?, preco = ?, atualizado_em = datetime('now','localtime') WHERE id = ?
            `).run(novaQtd, p.preco_unitario, produtoId);

            if (p.preco_unitario !== prod.preco) {
              db.prepare('INSERT INTO historico_precos (produto_id, preco) VALUES (?, ?)').run(produtoId, p.preco_unitario);
            }
          }
        } else if (p.cadastrar && p.categoria) {
          const result = db.prepare(`
            INSERT INTO produtos (nome, categoria, unidade, quantidade_atual, quantidade_minima, preco)
            VALUES (?, ?, 'Unidade', ?, ?, ?)
          `).run(sanitizarTexto(p.nome), sanitizarTexto(p.categoria), p.quantidade, p.quantidade_minima || 1, p.preco_unitario);
          produtoId = result.lastInsertRowid;
          db.prepare('INSERT INTO historico_precos (produto_id, preco) VALUES (?, ?)').run(produtoId, p.preco_unitario);
        }

        db.prepare(`
          INSERT INTO itens_feira (feira_id, produto_id, nome_produto, quantidade, preco_unitario)
          VALUES (?, ?, ?, ?, ?)
        `).run(feiraId, produtoId, String(p.nome).slice(0, 200), p.quantidade, p.preco_unitario);
      }

      return feiraId;
    });

    const feiraId = processar();
    res.json({ ok: true, feira_id: feiraId });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao confirmar feira' });
  }
});

module.exports = router;
