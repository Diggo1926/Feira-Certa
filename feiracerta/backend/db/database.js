const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Erro fatal: a variável de ambiente DATABASE_URL não está definida.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const CREATE_TABLES_SQL = `
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

    CREATE TABLE IF NOT EXISTS categorias (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(100) NOT NULL UNIQUE,
      criada_em TIMESTAMP NOT NULL DEFAULT NOW()
    );

    INSERT INTO configuracoes (chave, valor) VALUES ('meta_orcamento', '') ON CONFLICT DO NOTHING;
    INSERT INTO configuracoes (chave, valor) VALUES ('vapid_public_key', '') ON CONFLICT DO NOTHING;

    INSERT INTO categorias (nome) VALUES
      ('Grãos e Cereais'),
      ('Laticínios'),
      ('Carnes e Peixes'),
      ('Hortifrúti'),
      ('Bebidas'),
      ('Limpeza'),
      ('Higiene'),
      ('Temperos e Condimentos'),
      ('Massas e Pães'),
      ('Enlatados e Conservas'),
      ('Frios e Embutidos'),
      ('Congelados')
    ON CONFLICT (nome) DO NOTHING;
  `;

async function initDB() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await pool.query(CREATE_TABLES_SQL);
      console.log(`Conexão com o banco de dados estabelecida (tentativa ${attempt}/${MAX_RETRIES}).`);
      return;
    } catch (err) {
      console.error(`Tentativa ${attempt}/${MAX_RETRIES} de conexão com o banco de dados falhou: ${err.message}`);

      if (attempt === MAX_RETRIES) {
        console.error('Número máximo de tentativas de conexão com o banco de dados atingido. Encerrando o processo.');
        throw err;
      }

      const delayMs = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.log(`Aguardando ${delayMs / 1000}s antes da próxima tentativa...`);
      await sleep(delayMs);
    }
  }
}

module.exports = pool;
module.exports.initDB = initDB;
