const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validar } = require('../middleware/validacao');
const db = require('../db/database');
const webpush = require('web-push');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@feiracerta.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

router.get('/', async (req, res) => {
  try {
    const { rows: configs } = await db.query('SELECT chave, valor FROM configuracoes');
    const obj = {};
    configs.forEach(c => { obj[c.chave] = c.valor; });
    obj.vapid_public_key = process.env.VAPID_PUBLIC_KEY || '';
    res.json(obj);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar configurações' });
  }
});

router.put('/', [
  body('meta_orcamento').optional().isFloat({ min: 0 }).withMessage('Meta deve ser número positivo'),
  validar
], async (req, res) => {
  try {
    const { meta_orcamento } = req.body;
    if (meta_orcamento !== undefined) {
      await db.query(
        'INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor',
        ['meta_orcamento', String(meta_orcamento)]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao salvar configuração' });
  }
});

router.post('/push/subscribe', [
  body('endpoint').isURL(),
  body('keys.p256dh').notEmpty(),
  body('keys.auth').notEmpty(),
  validar
], async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    await db.query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES ($1, $2, $3)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [endpoint, keys.p256dh, keys.auth]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao salvar inscrição push' });
  }
});

router.post('/push/test', async (req, res) => {
  try {
    const { rows: subs } = await db.query('SELECT * FROM push_subscriptions');
    const payload = JSON.stringify({ title: 'FeiraCerta', body: 'Notificações ativadas!' });

    subs.forEach(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (e) {
        if (e.statusCode === 410) {
          await db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [s.endpoint]);
        }
      }
    });

    res.json({ ok: true, enviado: subs.length });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao enviar notificação de teste' });
  }
});

router.get('/backup/exportar', async (req, res) => {
  try {
    const [produtos, feiras, itens_feira, itens_lista_manual, historico_precos, registros_consumo, configuracoes] =
      await Promise.all([
        db.query('SELECT * FROM produtos'),
        db.query('SELECT * FROM feiras'),
        db.query('SELECT * FROM itens_feira'),
        db.query('SELECT * FROM itens_lista_manual'),
        db.query('SELECT * FROM historico_precos'),
        db.query('SELECT * FROM registros_consumo'),
        db.query('SELECT * FROM configuracoes')
      ]);

    const dados = {
      versao: '1.0',
      exportado_em: new Date().toISOString(),
      produtos: produtos.rows,
      feiras: feiras.rows,
      itens_feira: itens_feira.rows,
      itens_lista_manual: itens_lista_manual.rows,
      historico_precos: historico_precos.rows,
      registros_consumo: registros_consumo.rows,
      configuracoes: configuracoes.rows
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="feiracerta-backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(dados);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao exportar dados' });
  }
});

router.post('/backup/importar', async (req, res) => {
  const client = await db.connect();
  try {
    const dados = req.body;

    if (!dados.versao || !Array.isArray(dados.produtos)) {
      return res.status(400).json({ erro: 'Arquivo de backup inválido ou incompatível' });
    }

    await client.query('BEGIN');

    await client.query('DELETE FROM registros_consumo');
    await client.query('DELETE FROM historico_precos');
    await client.query('DELETE FROM itens_feira');
    await client.query('DELETE FROM itens_lista_manual');
    await client.query('DELETE FROM feiras');
    await client.query('DELETE FROM produtos');

    for (const p of dados.produtos) {
      await client.query(
        `INSERT INTO produtos (id, nome, categoria, unidade, quantidade_atual, quantidade_minima, preco, marca, codigo_barras, criado_em, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT DO NOTHING`,
        [p.id, p.nome, p.categoria, p.unidade, p.quantidade_atual, p.quantidade_minima, p.preco, p.marca, p.codigo_barras, p.criado_em, p.atualizado_em]
      );
    }

    for (const f of (dados.feiras || [])) {
      await client.query(
        'INSERT INTO feiras (id, data, valor_total, criado_em) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [f.id, f.data, f.valor_total, f.criado_em]
      );
    }

    for (const i of (dados.itens_feira || [])) {
      await client.query(
        'INSERT INTO itens_feira (id, feira_id, produto_id, nome_produto, quantidade, preco_unitario) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
        [i.id, i.feira_id, i.produto_id, i.nome_produto, i.quantidade, i.preco_unitario]
      );
    }

    for (const i of (dados.itens_lista_manual || [])) {
      await client.query(
        'INSERT INTO itens_lista_manual (id, nome, quantidade, marcado, criado_em) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [i.id, i.nome, i.quantidade, i.marcado, i.criado_em]
      );
    }

    for (const h of (dados.historico_precos || [])) {
      await client.query(
        'INSERT INTO historico_precos (id, produto_id, preco, registrado_em) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [h.id, h.produto_id, h.preco, h.registrado_em]
      );
    }

    for (const r of (dados.registros_consumo || [])) {
      await client.query(
        'INSERT INTO registros_consumo (id, produto_id, quantidade_anterior, quantidade_nova, registrado_em) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [r.id, r.produto_id, r.quantidade_anterior, r.quantidade_nova, r.registrado_em]
      );
    }

    for (const c of (dados.configuracoes || [])) {
      await client.query(
        'INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor',
        [c.chave, c.valor]
      );
    }

    // Reseta as sequences após importar IDs explícitos
    const tabelas = ['produtos', 'feiras', 'itens_feira', 'itens_lista_manual', 'historico_precos', 'registros_consumo'];
    for (const tabela of tabelas) {
      await client.query(`SELECT setval(pg_get_serial_sequence('${tabela}', 'id'), COALESCE(MAX(id), 1)) FROM ${tabela}`);
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: 'Erro ao importar backup' });
  } finally {
    client.release();
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const [abaixoMinimoRes, totalEstimadoRes, ultimaFeiraRes, penultimaFeiraRes, categoriaMaisCarenteRes, metaOrcamentoRes] =
      await Promise.all([
        db.query('SELECT COUNT(*) as total FROM produtos WHERE quantidade_atual < quantidade_minima'),
        db.query('SELECT COALESCE(SUM((quantidade_minima - quantidade_atual) * preco), 0) as total FROM produtos WHERE quantidade_atual < quantidade_minima'),
        db.query('SELECT data, valor_total FROM feiras ORDER BY data DESC LIMIT 1'),
        db.query('SELECT valor_total FROM feiras ORDER BY data DESC LIMIT 1 OFFSET 1'),
        db.query('SELECT categoria, COUNT(*) as qtd FROM produtos WHERE quantidade_atual < quantidade_minima GROUP BY categoria ORDER BY qtd DESC LIMIT 1'),
        db.query("SELECT valor FROM configuracoes WHERE chave = 'meta_orcamento'")
      ]);

    const abaixoMinimo = parseInt(abaixoMinimoRes.rows[0].total, 10);
    const totalEstimado = parseFloat(totalEstimadoRes.rows[0].total);
    const ultimaFeira = ultimaFeiraRes.rows[0] || null;
    const penultimaFeira = penultimaFeiraRes.rows[0] || null;
    const categoriaMaisCarente = categoriaMaisCarenteRes.rows[0] || null;
    const metaOrcamento = metaOrcamentoRes.rows[0] || null;

    let diasDesdeUltimaFeira = null;
    if (ultimaFeira) {
      diasDesdeUltimaFeira = Math.floor((Date.now() - new Date(ultimaFeira.data).getTime()) / (1000 * 60 * 60 * 24));
    }

    let variacaoFeira = null;
    if (ultimaFeira && penultimaFeira && penultimaFeira.valor_total > 0) {
      variacaoFeira = Math.round(((ultimaFeira.valor_total - penultimaFeira.valor_total) / penultimaFeira.valor_total) * 100 * 10) / 10;
    }

    res.json({
      abaixo_minimo: abaixoMinimo,
      total_estimado: Math.round(totalEstimado * 100) / 100,
      ultima_feira: ultimaFeira,
      dias_desde_ultima_feira: diasDesdeUltimaFeira,
      categoria_mais_carente: categoriaMaisCarente,
      variacao_feira: variacaoFeira,
      meta_orcamento: metaOrcamento?.valor || ''
    });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar dados do dashboard' });
  }
});

module.exports = router;
