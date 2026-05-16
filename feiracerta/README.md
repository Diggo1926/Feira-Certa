# FeiraCerta — Controle de Estoque Doméstico

Sistema web responsivo para controle de estoque da casa com leitor de nota fiscal da SEFAZ-SE, lista de compras inteligente e histórico de feiras.

## Stack

- **Backend**: Node.js + Express — deploy Railway
- **Banco**: SQLite via `better-sqlite3`
- **Frontend**: HTML/CSS/JS puro (sem framework) — deploy Vercel
- **Scanner**: `html5-qrcode` via CDN
- **PDF**: `pdfkit`
- **Notificações**: Web Push + PWA

---

## Desenvolvimento local

### Backend

```bash
cd feiracerta/backend
npm install
cp .env.example .env
# edite .env com suas configurações
npm start
```

### Frontend

Edite `frontend/env.js` com a URL local do backend:

```javascript
window.ENV_API_URL = 'http://localhost:3000';
```

Abra `frontend/index.html` diretamente no navegador ou sirva com qualquer servidor estático:

```bash
npx serve feiracerta/frontend
```

### Gerar chaves VAPID (notificações push)

```bash
npx web-push generate-vapid-keys
```

---

## Deploy — Backend no Railway

### 1. Criar projeto

1. Acesse [railway.app](https://railway.app) e crie um novo projeto
2. Conecte o repositório GitHub
3. Se o repo contiver múltiplos projetos, configure **Root Directory** como `feiracerta`

### 2. Configurar volume persistente (SQLite)

1. Na aba do serviço, vá em **Volumes**
2. Crie um volume com mount path: `/data`
3. O banco será salvo em `/data/feiracerta.db` e não será perdido nos deploys

### 3. Variáveis de ambiente (Railway)

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `FRONTEND_URL` | URL do frontend no Vercel (ex: `https://feiracerta.vercel.app`) |
| `DB_PATH` | `/data/feiracerta.db` |
| `VAPID_PUBLIC_KEY` | chave pública gerada com `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | chave privada |
| `VAPID_EMAIL` | `mailto:seu@email.com` |

O `railway.toml` na raiz já configura build e start automaticamente.

---

## Deploy — Frontend no Vercel

### 1. Criar projeto

1. Acesse [vercel.com](https://vercel.com) e importe o repositório
2. Configure **Root Directory** como `feiracerta/frontend`
3. **Framework Preset**: Other (sem framework)

### 2. Variável de ambiente (Vercel)

| Variável | Valor |
|---|---|
| `API_URL` | URL pública do backend no Railway (ex: `https://feiracerta.up.railway.app`) |

O `vercel.json` inclui um `buildCommand` que gera o arquivo `env.js` automaticamente a partir dessa variável. Sem essa variável, o frontend tentará fazer chamadas para a mesma origem (funciona apenas em dev local).

> **Alternativa sem build command**: Crie manualmente um arquivo `frontend/env.js` com:
> ```javascript
> window.ENV_API_URL = 'https://seu-backend.up.railway.app';
> ```
> e faça o upload como arquivo estático antes do deploy.

### 3. SPA routing

O `vercel.json` já redireciona todas as rotas para `index.html`, necessário para o funcionamento do roteamento client-side.

---

## Estrutura de pastas

```
feiracerta/
  backend/
    server.js           # Express — somente rotas de API
    routes/
      produtos.js
      feiras.js
      lista.js
      nota.js
      consumo.js
      configuracoes.js
    middleware/
      validacao.js
    db/
      database.js
    .env.example
    package.json
  frontend/
    index.html          # SPA principal
    env.js              # URL do backend (editar localmente; gerado no Vercel)
    vercel.json         # SPA routing + build command para env.js
    manifest.json       # PWA
    service-worker.js
    css/style.css
    js/
      app.js            # Roteamento, utilitários (usa window.ENV_API_URL)
      estoque.js
      cadastro.js
      lista.js
      feira.js
      historico.js
      consumo.js
      configuracoes.js
    icons/
  railway.toml
  README.md
```

---

## Funcionalidades

- **Dashboard** com alertas contextuais e cards de resumo
- **Estoque** agrupado por categoria com controles de quantidade
- **Cadastro** com scanner de código de barras e histórico de preços
- **Lista de Compras** automática + itens manuais + exportação PDF + WhatsApp
- **Modo Feira** simplificado para uso durante as compras
- **Registrar Feira** via QR Code da NF-e da SEFAZ-SE com scraping automático
- **Histórico** de feiras com gráfico de evolução de gastos
- **Backup** export/import JSON completo
- **PWA** instalável com notificações push

---

## Segurança

- CORS restrito ao domínio do Vercel (`FRONTEND_URL`)
- Rate limiting em todas as rotas (mais estrito em `/api/nota`)
- `helmet` com headers de segurança
- Queries parametrizadas (sem concatenação SQL)
- Body limit de 10kb
- Validação de inputs com `express-validator`
- Sanitização de textos no backend
- Stack traces nunca expostos ao cliente
- SSL automático via Railway e Vercel
