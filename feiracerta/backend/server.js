require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:"],
    }
  }
}));

// CORS
const frontendUrl = process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || frontendUrl === '*' || origin === frontendUrl) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// Body limit + charset
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use((req, res, next) => {
  res.setHeader('Content-Type-Options', 'nosniff');
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisições. Tente novamente em breve.' }
});

const limiterStrict = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { erro: 'Limite de requisições para esta rota atingido.' }
});

app.use('/api/', limiter);
app.use('/api/nota/', limiterStrict);

// Routes
app.use('/api/produtos', require('./routes/produtos'));
app.use('/api/feiras', require('./routes/feiras'));
app.use('/api/lista', require('./routes/lista'));
app.use('/api/nota', require('./routes/nota'));
app.use('/api/consumo', require('./routes/consumo'));
app.use('/api/config', require('./routes/configuracoes'));

// Error handler - never expose stack traces
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`FeiraCerta rodando na porta ${PORT}`);
});

module.exports = app;
