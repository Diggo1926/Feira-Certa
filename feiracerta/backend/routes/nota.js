const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validar, sanitizarTexto } = require('../middleware/validacao');
const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../db/database');

const SEFAZ_TIMEOUT = 15000;
const MAX_RETRIES = 1;
const SEFAZ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9'
};

async function fetchComRetry(url, tentativas = MAX_RETRIES) {
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < tentativas; i++) {
    try {
      const resp = await axios.get(url, {
        timeout: SEFAZ_TIMEOUT,
        headers: SEFAZ_HEADERS,
        maxRedirects: 5
      });
      return resp.data;
    } catch (e) {
      console.log(`[SEFAZ] Erro tentativa ${i + 1}: ${e.code || e.message}`);
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
  body('url').optional().isURL({ protocols: ['http', 'https'], require_protocol: true }),
  body('chave').optional().matches(/^\d{44}$/),
  validar
], async (req, res) => {
  try {
    let { url, chave } = req.body;

    if (!url && !chave) {
      return res.status(400).json({ erro: 'Informe a URL ou chave de acesso da nota fiscal' });
    }

    if (!url && chave) {
      url = `http://www.nfce.se.gov.br/nfce/consulta?chNFe=${chave}`;
    }

    const urlObj = new URL(url);
    const dominiosPermitidos = [
      'www.nfce.se.gov.br', 'nfce.se.gov.br',
      'nfce.sefaz.se.gov.br', 'www.sefaz.se.gov.br',
      'nfe.fazenda.gov.br'
    ];
    if (!dominiosPermitidos.some(d => urlObj.hostname === d)) {
      return res.status(400).json({ erro: 'URL deve ser da SEFAZ-SE' });
    }

    console.log(`[SEFAZ] Buscando: ${url}`);
    const html = await fetchComRetry(url);
    console.log(`[SEFAZ] HTML recebido: ${html.length} chars`);

    const produtos = parsearNFe(html);
    console.log(`[SEFAZ] Produtos extraídos: ${produtos.length}`);

    if (produtos.length === 0) {
      return res.status(422).json({ erro: 'Não foi possível extrair produtos desta nota. Tente o registro manual.' });
    }

    const resultado = await Promise.all(produtos.map(async p => {
      const { rows: [existente] } = await db.query(
        'SELECT * FROM produtos WHERE nome ILIKE $1 OR nome ILIKE $2',
        [p.nome, `%${p.nome.split(' ')[0]}%`]
      );
      return { ...p, produto_existente: existente || null, novo: !existente };
    }));

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
