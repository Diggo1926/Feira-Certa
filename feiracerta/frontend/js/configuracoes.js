window._config = {};

async function carregarDashboard() {
  try {
    const [dados, config, gastos] = await Promise.all([
      api('/api/config/dashboard'),
      api('/api/config'),
      api('/api/feiras/stats/gasto-categoria')
    ]);

    window._config = config;

    // Alertas
    let alertasHtml = '';
    if (dados.abaixo_minimo >= 5) {
      alertasHtml += `
        <div class="card card-alerta">
          <div class="card-alerta-titulo">⚠️ Estoque Baixo</div>
          <div class="card-alerta-texto">${dados.abaixo_minimo} itens abaixo do mínimo. Hora de fazer a feira!</div>
        </div>`;
    }
    if (dados.variacao_feira !== null && dados.variacao_feira > 10) {
      alertasHtml += `
        <div class="card card-alerta">
          <div class="card-alerta-titulo">📈 Feira Mais Cara</div>
          <div class="card-alerta-texto">A última feira ficou ${dados.variacao_feira}% mais cara que a anterior.</div>
        </div>`;
    }
    document.getElementById('alertas-dashboard').innerHTML = alertasHtml;

    // Cards
    const diasStr = dados.dias_desde_ultima_feira !== null
      ? `Há ${dados.dias_desde_ultima_feira} dias`
      : 'Nenhuma registrada';

    let gastosHtml = '';
    if (gastos.length) {
      gastosHtml = `
        <div class="bloco-titulo" style="margin-top:8px;font-size:11px">Gasto médio por categoria</div>
        ${gastos.slice(0, 3).map(g => `
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid var(--borda)">
            <span>${g.categoria}</span>
            <span style="font-weight:700;color:var(--musgo)">${formatarMoeda(g.media_mensal)}</span>
          </div>`).join('')}`;
    }

    document.getElementById('cards-dashboard').innerHTML = `
      <div class="card card-destaque" style="margin-bottom:12px">
        <div class="card-label">Próxima Feira — Estimado</div>
        <div class="card-valor">${formatarMoeda(dados.total_estimado)}</div>
        <div class="card-sub">${dados.abaixo_minimo} itens precisando de reposição</div>
      </div>

      <div class="cards-grid">
        <div class="card-mini">
          <div class="card-mini-label">Última Feira</div>
          <div class="card-mini-valor" style="font-size:14px">${dados.ultima_feira ? formatarData(dados.ultima_feira.data) : '—'}</div>
          <div class="card-mini-sub">${diasStr}</div>
        </div>
        <div class="card-mini">
          <div class="card-mini-label">Itens Baixos</div>
          <div class="card-mini-valor" style="color:${dados.abaixo_minimo > 0 ? 'var(--caramelo)' : 'var(--musgo)'}">${dados.abaixo_minimo}</div>
          <div class="card-mini-sub">${dados.categoria_mais_carente ? dados.categoria_mais_carente.categoria : 'Tudo OK'}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-mini-label">Gastos por Categoria</div>
        ${gastosHtml || '<p style="color:var(--texto-sec);font-size:13px;margin-top:8px">Registre feiras para ver os gastos.</p>'}
      </div>`;
  } catch (e) {
    document.getElementById('cards-dashboard').innerHTML = `<div class="empty-state"><p>Erro ao carregar dashboard.</p></div>`;
  }
}

async function salvarConfiguracao() {
  const meta = document.getElementById('meta-orcamento').value;
  try {
    await api('/api/config', { method: 'PUT', body: { meta_orcamento: parseFloat(meta) || 0 } });
    toast('Configuração salva!', 'sucesso');
    window._config.meta_orcamento = meta;
  } catch (e) {
    toast('Erro ao salvar', 'erro');
  }
}

async function carregarConfiguracoes() {
  try {
    const config = await api('/api/config');
    document.getElementById('meta-orcamento').value = config.meta_orcamento || '';
    window._config = config;
  } catch (e) {}
}

async function ativarNotificacoes() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    toast('Notificações não suportadas neste dispositivo', 'erro');
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    toast('Permissão de notificação negada', 'erro');
    return;
  }

  try {
    const config = await api('/api/config');
    const vapidKey = config.vapid_public_key;
    if (!vapidKey) {
      toast('Notificações locais ativadas (sem push remoto)', 'sucesso');
      return;
    }

    const sw = await navigator.serviceWorker.ready;
    const sub = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });

    await api('/api/config/push/subscribe', { method: 'POST', body: sub.toJSON() });
    toast('Notificações ativadas!', 'sucesso');
  } catch (e) {
    toast('Notificações locais ativadas', 'sucesso');
  }
}

async function testarNotificacao() {
  if (Notification.permission === 'granted') {
    new Notification('Feira-Certa', { body: 'Notificações funcionando!', icon: '/icons/icon-192.png' });
  } else {
    toast('Ative as notificações primeiro', 'erro');
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function exportarBackup() {
  try {
    const link = document.createElement('a');
    link.href = (window.ENV_API_URL || '') + '/api/config/backup/exportar';
    link.download = `feiracerta-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  } catch (e) {
    toast('Erro ao exportar', 'erro');
  }
}

async function importarBackup(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;

  try {
    const texto = await file.text();
    const dados = JSON.parse(texto);

    if (!dados.versao || !Array.isArray(dados.produtos)) {
      toast('Arquivo de backup inválido', 'erro');
      return;
    }

    if (!confirm(`Importar backup com ${dados.produtos.length} produtos?\n\nATENÇÃO: Isso vai sobrescrever todos os dados atuais.`)) return;

    await api('/api/config/backup/importar', { method: 'POST', body: dados });
    toast('Backup importado com sucesso!', 'sucesso');
    carregarDashboard();
  } catch (e) {
    toast('Erro ao importar backup: ' + e.message, 'erro');
  } finally {
    inputEl.value = '';
  }
}
