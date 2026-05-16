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

router.get('/', (req, res) => {
  try {
    const configs = db.prepare('SELECT chave, valor FROM configuracoes').all();
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
], (req, res) => {
  try {
    const { meta_orcamento } = req.body;
    if (meta_orcamento !== undefined) {
      db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)').run('meta_orcamento', String(meta_orcamento));
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
], (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    db.prepare(`
      INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
    `).run(endpoint, keys.p256dh, keys.auth);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao salvar inscrição push' });
  }
});

router.post('/push/test', (req, res) => {
  try {
    const subs = db.prepare('SELECT * FROM push_subscriptions').all();
    const payload = JSON.stringify({ title: 'FeiraCerta', body: 'Notificações ativadas!' });

    subs.forEach(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (e) {
        if (e.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(s.endpoint);
        }
      }
    });

    res.json({ ok: true, enviado: subs.length });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao enviar notificação de teste' });
  }
});

router.get('/backup/exportar', (req, res) => {
  try {
    const dados = {
      versao: '1.0',
      exportado_em: new Date().toISOString(),
      produtos: db.prepare('SELECT * FROM produtos').all(),
      feiras: db.prepare('SELECT * FROM feiras').all(),
      itens_feira: db.prepare('SELECT * FROM itens_feira').all(),
      itens_lista_manual: db.prepare('SELECT * FROM itens_lista_manual').all(),
      historico_precos: db.prepare('SELECT * FROM historico_precos').all(),
      registros_consumo: db.prepare('SELECT * FROM registros_consumo').all(),
      configuracoes: db.prepare('SELECT * FROM configuracoes').all()
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="feiracerta-backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(dados);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao exportar dados' });
  }
});

router.post('/backup/importar', (req, res) => {
  try {
    const dados = req.body;

    if (!dados.versao || !Array.isArray(dados.produtos)) {
      return res.status(400).json({ erro: 'Arquivo de backup inválido ou incompatível' });
    }

    const importar = db.transaction(() => {
      db.prepare('DELETE FROM registros_consumo').run();
      db.prepare('DELETE FROM historico_precos').run();
      db.prepare('DELETE FROM itens_feira').run();
      db.prepare('DELETE FROM itens_lista_manual').run();
      db.prepare('DELETE FROM feiras').run();
      db.prepare('DELETE FROM produtos').run();

      for (const p of dados.produtos) {
        db.prepare(`
          INSERT OR IGNORE INTO produtos (id, nome, categoria, unidade, quantidade_atual, quantidade_minima, preco, marca, codigo_barras, criado_em, atualizado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(p.id, p.nome, p.categoria, p.unidade, p.quantidade_atual, p.quantidade_minima, p.preco, p.marca, p.codigo_barras, p.criado_em, p.atualizado_em);
      }

      for (const f of (dados.feiras || [])) {
        db.prepare('INSERT OR IGNORE INTO feiras (id, data, valor_total, criado_em) VALUES (?, ?, ?, ?)').run(f.id, f.data, f.valor_total, f.criado_em);
      }

      for (const i of (dados.itens_feira || [])) {
        db.prepare('INSERT OR IGNORE INTO itens_feira (id, feira_id, produto_id, nome_produto, quantidade, preco_unitario) VALUES (?, ?, ?, ?, ?, ?)').run(i.id, i.feira_id, i.produto_id, i.nome_produto, i.quantidade, i.preco_unitario);
      }

      for (const i of (dados.itens_lista_manual || [])) {
        db.prepare('INSERT OR IGNORE INTO itens_lista_manual (id, nome, quantidade, marcado, criado_em) VALUES (?, ?, ?, ?, ?)').run(i.id, i.nome, i.quantidade, i.marcado, i.criado_em);
      }

      for (const h of (dados.historico_precos || [])) {
        db.prepare('INSERT OR IGNORE INTO historico_precos (id, produto_id, preco, registrado_em) VALUES (?, ?, ?, ?)').run(h.id, h.produto_id, h.preco, h.registrado_em);
      }

      for (const r of (dados.registros_consumo || [])) {
        db.prepare('INSERT OR IGNORE INTO registros_consumo (id, produto_id, quantidade_anterior, quantidade_nova, registrado_em) VALUES (?, ?, ?, ?, ?)').run(r.id, r.produto_id, r.quantidade_anterior, r.quantidade_nova, r.registrado_em);
      }

      for (const c of (dados.configuracoes || [])) {
        db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)').run(c.chave, c.valor);
      }
    });

    importar();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao importar backup' });
  }
});

router.get('/dashboard', (req, res) => {
  try {
    const abaixoMinimo = db.prepare(`
      SELECT COUNT(*) as total FROM produtos WHERE quantidade_atual < quantidade_minima
    `).get().total;

    const totalEstimado = db.prepare(`
      SELECT COALESCE(SUM((quantidade_minima - quantidade_atual) * preco), 0) as total
      FROM produtos WHERE quantidade_atual < quantidade_minima
    `).get().total;

    const ultimaFeira = db.prepare('SELECT data, valor_total FROM feiras ORDER BY data DESC LIMIT 1').get();
    const penultimaFeira = db.prepare('SELECT valor_total FROM feiras ORDER BY data DESC LIMIT 1 OFFSET 1').get();

    const categoriaMaisCarente = db.prepare(`
      SELECT categoria, COUNT(*) as qtd
      FROM produtos WHERE quantidade_atual < quantidade_minima
      GROUP BY categoria ORDER BY qtd DESC LIMIT 1
    `).get();

    const metaOrcamento = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'meta_orcamento'").get();

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
      ultima_feira: ultimaFeira || null,
      dias_desde_ultima_feira: diasDesdeUltimaFeira,
      categoria_mais_carente: categoriaMaisCarente || null,
      variacao_feira: variacaoFeira,
      meta_orcamento: metaOrcamento?.valor || ''
    });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar dados do dashboard' });
  }
});

module.exports = router;
