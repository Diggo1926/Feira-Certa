const CACHE_NAME = 'feiracerta-v1';
const STATIC_ASSETS = ['/', '/css/style.css', '/js/app.js', '/js/estoque.js', '/js/cadastro.js', '/js/lista.js', '/js/feira.js', '/js/historico.js', '/js/consumo.js', '/js/configuracoes.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'Feira-Certa', body: 'Nova notificação' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});

// Verificações agendadas de estoque
function agendarVerificacoes() {
  setTimeout(async () => {
    try {
      const resp = await fetch('/api/config/dashboard');
      const dados = await resp.json();

      if (dados.abaixo_minimo >= 5) {
        self.registration.showNotification('Feira-Certa — Estoque Baixo', {
          body: `${dados.abaixo_minimo} itens abaixo do mínimo. Hora de fazer a feira!`,
          icon: '/icons/icon-192.png'
        });
      }

      if (dados.dias_desde_ultima_feira !== null && dados.dias_desde_ultima_feira >= 28) {
        self.registration.showNotification('Feira-Certa — Faz tempo!', {
          body: `Sua última feira foi há ${dados.dias_desde_ultima_feira} dias. Que tal fazer uma nova?`,
          icon: '/icons/icon-192.png'
        });
      }
    } catch (e) {}
  }, 5000);
}

self.addEventListener('activate', () => agendarVerificacoes());
