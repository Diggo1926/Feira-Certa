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
          <div class="card-alerta-titulo" style="display:flex;align-items:center;gap:6px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Estoque Baixo</div>
          <div class="card-alerta-texto">${dados.abaixo_minimo} itens abaixo do mínimo. Hora de fazer a feira!</div>
        </div>`;
    }
    if (dados.variacao_feira !== null && dados.variacao_feira > 10) {
      alertasHtml += `
        <div class="card card-alerta">
          <div class="card-alerta-titulo" style="display:flex;align-items:center;gap:6px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> Feira Mais Cara</div>
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
  carregarSecaoCategorias();
}

// ─── Gerenciamento de categorias ──────────────────────────────────────────

async function carregarSecaoCategorias() {
  const el = document.getElementById('lista-categorias-config');
  if (!el) return;
  try {
    const cats = await api('/api/categorias');
    if (!cats.length) {
      el.innerHTML = '<p style="font-size:13px;color:var(--texto-sec)">Nenhuma categoria cadastrada.</p>';
      return;
    }
    el.innerHTML = cats.map(c => _renderCategoriaConfig(c)).join('');
  } catch (e) {
    el.innerHTML = '<p style="font-size:13px;color:var(--erro)">Erro ao carregar categorias.</p>';
  }
}

function _renderCategoriaConfig(c) {
  const nomeEsc = c.nome.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  return `
    <div id="cat-cfg-${c.id}" style="display:flex;align-items:center;gap:6px;padding:9px 0;border-bottom:1px solid var(--borda)">
      <span style="flex:1;font-size:14px;color:var(--texto)">${c.nome}</span>
      <button class="btn btn-secundario btn-sm btn-icon" title="Editar" onclick="iniciarEditCategoriaConfig(${c.id},'${nomeEsc}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="btn btn-secundario btn-sm btn-icon" title="Excluir" onclick="excluirCategoriaConfig(${c.id},'${nomeEsc}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>`;
}

function iniciarEditCategoriaConfig(id, nomeAtual) {
  const item = document.getElementById(`cat-cfg-${id}`);
  if (!item) return;
  item.innerHTML = `
    <div style="display:flex;gap:6px;width:100%;align-items:center">
      <input id="edit-cat-cfg-${id}" type="text" value="${nomeAtual}" maxlength="100" style="flex:1"
        onkeydown="if(event.key==='Enter') salvarEditCategoriaConfig(${id}); if(event.key==='Escape') carregarSecaoCategorias();">
      <button class="btn btn-primario btn-sm" onclick="salvarEditCategoriaConfig(${id})">Salvar</button>
      <button class="btn btn-secundario btn-sm" onclick="carregarSecaoCategorias()">Cancelar</button>
    </div>`;
  document.getElementById(`edit-cat-cfg-${id}`)?.focus();
}

async function salvarEditCategoriaConfig(id) {
  const input = document.getElementById(`edit-cat-cfg-${id}`);
  const nome = input?.value?.trim();
  if (!nome) { toast('Nome não pode ser vazio', 'erro'); return; }
  try {
    await api(`/api/categorias/${id}`, { method: 'PUT', body: { nome } });
    toast('Categoria renomeada!', 'sucesso');
  } catch (e) {
    toast(e.message.includes('já existe') ? 'Já existe uma categoria com esse nome' : (e.message || 'Erro ao renomear'), 'erro');
  }
  carregarSecaoCategorias();
}

async function excluirCategoriaConfig(id, nome) {
  if (!confirm(`Excluir a categoria "${nome}"?`)) return;
  try {
    await api(`/api/categorias/${id}`, { method: 'DELETE' });
    toast('Categoria excluída!', 'sucesso');
  } catch (e) {
    if (e.message.includes('em uso')) {
      toast('Categoria em uso — remova os produtos antes de excluir', 'erro');
    } else {
      toast(e.message || 'Erro ao excluir', 'erro');
    }
  }
  carregarSecaoCategorias();
}

function iniciarAddCategoriaConfig() {
  const form = document.getElementById('add-categoria-config-form');
  if (!form) return;
  form.style.display = 'block';
  const inp = document.getElementById('nova-cat-config-input');
  inp.value = '';
  document.getElementById('nova-cat-config-erro').style.display = 'none';
  inp.focus();
}

function cancelarAddCategoriaConfig() {
  document.getElementById('add-categoria-config-form').style.display = 'none';
}

async function confirmarAddCategoriaConfig() {
  const nome = document.getElementById('nova-cat-config-input')?.value?.trim();
  const erroEl = document.getElementById('nova-cat-config-erro');
  if (!nome) {
    erroEl.textContent = 'Nome não pode ser vazio';
    erroEl.style.display = 'block';
    return;
  }
  erroEl.style.display = 'none';
  try {
    await api('/api/categorias', { method: 'POST', body: { nome } });
    toast('Categoria criada!', 'sucesso');
    cancelarAddCategoriaConfig();
  } catch (e) {
    erroEl.textContent = e.message.includes('já existe') ? 'Categoria já existe' : (e.message || 'Erro ao criar');
    erroEl.style.display = 'block';
    return;
  }
  carregarSecaoCategorias();
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
    const res = await fetch(((window.ENV || {}).API_URL || '') + '/api/config/backup/exportar', {
      headers: { 'X-App-Token': (window.ENV || {}).APP_SECRET_TOKEN || '' }
    });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feiracerta-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
