const API = (window.ENV || {}).API_URL || '';

// ─── HTTP autenticado ──────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const { body: bodyData, headers: extraHeaders, ...resto } = opts;
  const res = await fetch(API + path, {
    ...resto,
    headers: {
      'Content-Type': 'application/json',
      'X-App-Token': (window.ENV || {}).APP_SECRET_TOKEN || '',
      ...(extraHeaders || {})
    },
    body: bodyData !== undefined ? JSON.stringify(bodyData) : undefined
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ erro: 'Erro desconhecido' }));
    throw new Error(err.erro || 'Erro na requisição');
  }
  return res.json();
}

// ─── Utilitários de UI ─────────────────────────────────────────────────────

function toast(msg, tipo = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast visivel ' + tipo;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('visivel'), 3000);
}

function irPara(pagId) {
  document.querySelectorAll('.pagina').forEach(p => p.classList.remove('ativa'));
  document.getElementById(pagId)?.classList.add('ativa');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('ativo', n.dataset.pg === pagId);
  });

  const fab = document.getElementById('fab-consumo');
  if (fab) fab.style.display = pagId === 'pg-inicio' ? 'flex' : 'none';

  if (pagId === 'pg-inicio') carregarDashboard();
  if (pagId === 'pg-estoque') carregarEstoque();
  if (pagId === 'pg-lista') carregarLista();
  if (pagId === 'pg-historico') carregarHistorico();
  if (pagId === 'pg-config') carregarConfiguracoes();
}

function formatarMoeda(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
}

function formatarData(str) {
  if (!str) return '—';
  const d = new Date(str + 'T12:00:00');
  return d.toLocaleDateString('pt-BR');
}

function loading(html = '<div class="loading"><div class="spinner"></div> Carregando...</div>') {
  return html;
}

// ─── PWA e notificações ────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}

async function solicitarNotificacoes() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 3000);
  }
}

// ─── Inicialização ─────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  carregarDashboard();
  solicitarNotificacoes();
  _inicializarNavToque();
});

// ─── Navegação touch-safe ──────────────────────────────────────────────────
// Diferencia scroll de tap: só navega se o dedo se moveu menos de 8px em Y.
// Quando dy >= 8 (scroll), chama preventDefault no touchend para suprimir
// o click sintético que o browser geraria e que dispararia o onclick.

function _inicializarNavToque() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    let touchStartY = 0;
    btn.addEventListener('touchstart', e => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    btn.addEventListener('touchend', e => {
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
      if (dy >= 8) {
        e.preventDefault(); // era scroll — cancela o click sintético
      }
      // dy < 8 → tap real → click sintético dispara o onclick normalmente
    }, { passive: false });
  });
}

// ─── Gráfico Canvas ────────────────────────────────────────────────────────

function desenharGrafico(canvasId, labels, valores, cor = '#C9956E') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || canvas.width;
  const H = canvas.height;
  canvas.width = W;

  ctx.clearRect(0, 0, W, H);
  if (valores.length < 2) {
    ctx.fillStyle = '#7A6A5A';
    ctx.font = '13px Nunito';
    ctx.textAlign = 'center';
    ctx.fillText('Dados insuficientes para o gráfico', W / 2, H / 2);
    return;
  }

  const pad = { top: 16, right: 16, bottom: 28, left: 52 };
  const gW = W - pad.left - pad.right;
  const gH = H - pad.top - pad.bottom;
  const min = Math.min(...valores) * 0.9;
  const max = Math.max(...valores) * 1.05;
  const range = max - min || 1;

  const px = (i) => pad.left + (i / (valores.length - 1)) * gW;
  const py = (v) => pad.top + gH - ((v - min) / range) * gH;

  ctx.beginPath();
  ctx.moveTo(px(0), py(valores[0]));
  valores.forEach((v, i) => { if (i > 0) ctx.lineTo(px(i), py(v)); });
  ctx.lineTo(px(valores.length - 1), pad.top + gH);
  ctx.lineTo(px(0), pad.top + gH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + gH);
  grad.addColorStop(0, cor + '44');
  grad.addColorStop(1, cor + '00');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = cor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.moveTo(px(0), py(valores[0]));
  valores.forEach((v, i) => { if (i > 0) ctx.lineTo(px(i), py(v)); });
  ctx.stroke();

  valores.forEach((v, i) => {
    ctx.beginPath();
    ctx.arc(px(i), py(v), 4, 0, Math.PI * 2);
    ctx.fillStyle = cor;
    ctx.fill();
    ctx.strokeStyle = '#FBF8F3';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.fillStyle = '#7A6A5A';
  ctx.font = '10px Nunito';
  ctx.textAlign = 'center';
  const passo = Math.max(1, Math.floor(labels.length / 5));
  labels.forEach((l, i) => {
    if (i % passo === 0 || i === labels.length - 1) ctx.fillText(l, px(i), H - 6);
  });

  ctx.textAlign = 'right';
  [min, (min + max) / 2, max].forEach(v => {
    const y = py(v);
    ctx.fillText('R$' + v.toFixed(0), pad.left - 4, y + 4);
    ctx.strokeStyle = '#D6C9B6';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}
