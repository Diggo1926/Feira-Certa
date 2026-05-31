const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS produtos (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'Geral',
      unidade TEXT NOT NULL DEFAULT 'Unidade',
      quantidade_atual REAL NOT NULL DEFAULT 0,
      quantidade_minima REAL NOT NULL DEFAULT 1,
      preco REAL NOT NULL DEFAULT 0,
      marca TEXT,
      codigo_barras TEXT,
      criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS feiras (
      id SERIAL PRIMARY KEY,
      data TEXT NOT NULL,
      valor_total REAL NOT NULL DEFAULT 0,
      criado_em TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS itens_feira (
      id SERIAL PRIMARY KEY,
      feira_id INTEGER NOT NULL REFERENCES feiras(id) ON DELETE CASCADE,
      produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
      nome_produto TEXT NOT NULL,
      quantidade REAL NOT NULL DEFAULT 1,
      preco_unitario REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS itens_lista_manual (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      quantidade TEXT NOT NULL DEFAULT '1',
      marcado INTEGER NOT NULL DEFAULT 0,
      criado_em TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS historico_precos (
      id SERIAL PRIMARY KEY,
      produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
      preco REAL NOT NULL,
      registrado_em TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS registros_consumo (
      id SERIAL PRIMARY KEY,
      produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
      quantidade_anterior REAL NOT NULL,
      quantidade_nova REAL NOT NULL,
      registrado_em TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      id SERIAL PRIMARY KEY,
      chave TEXT NOT NULL UNIQUE,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT NOW()
    );

    INSERT INTO configuracoes (chave, valor) VALUES ('meta_orcamento', '') ON CONFLICT DO NOTHING;
    INSERT INTO configuracoes (chave, valor) VALUES ('vapid_public_key', '') ON CONFLICT DO NOTHING;
  `);
}

module.exports = pool;
module.exports.initDB = initDB;
