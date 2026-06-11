let _listaAtual = { automaticos: [], manuais: [] };
let _marcadosAuto = new Set();
let _modoSelecaoLista = false;
let _selecionadosListaAuto = new Set();
let _selecionadosListaManual = new Set();

async function carregarLista() {
  const el = document.getElementById('conteudo-lista');
  el.innerHTML = loading();
  try {
    _listaAtual = await api('/api/lista');
    renderizarLista();
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><p>Erro ao carregar lista.</p></div>`;
  }
}

function renderizarLista() {
  const { automaticos, manuais } = _listaAtual;
  const totalAuto = automaticos.reduce((s, i) => s + (Math.ceil(i.quantidade_sugerida) * i.preco), 0);

  const config = window._config || {};
  const meta = parseFloat(config.meta_orcamento);
  const ultrapassou = meta > 0 && totalAuto > meta;

  document.getElementById('total-lista').innerHTML = `
    <div class="total-card ${ultrapassou ? 'total-card-alerta' : ''}">
      <div>
        <div style="font-size:12px;color:rgba(255,255,255,0.85);font-weight:600;text-transform:uppercase">Total Estimado</div>
        <div class="total-card-valor">${formatarMoeda(totalAuto)}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.85)">${automaticos.length} itens do estoque${ultrapassou ? ' · <svg style="vertical-align:middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Meta ultrapassada!' : ''}</div>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="36" height="36"><path d="M1 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-10 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>
    </div>`;

  let html = '';

  if (automaticos.length > 0) {
    html += `<div class="categoria-titulo" style="color:var(--musgo)">Do Estoque</div>`;
    automaticos.forEach(item => {
      const qtd = Math.ceil(item.quantidade_sugerida);

      if (_modoSelecaoLista) {
        const sel = _selecionadosListaAuto.has(item.id);
        html += `
          <div class="lista-item${sel ? ' selecionado' : ''}" onclick="toggleSelecionadoListaAuto(${item.id})">
            <div class="produto-checkbox${sel ? ' checked' : ''}">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="lista-item-info">
              <div class="lista-item-nome">${item.nome}</div>
              <div class="lista-item-meta">${qtd} ${item.unidade} <span class="badge badge-ok" style="font-size:10px">auto</span></div>
            </div>
            <div class="lista-item-preco">${formatarMoeda(qtd * item.preco)}</div>
          </div>`;
      } else {
        const marcado = _marcadosAuto.has(item.id);
        html += `
          <div class="lista-item ${marcado ? 'marcado' : ''}" onclick="marcarItemAuto(${item.id})">
            <div class="lista-checkbox ${marcado ? 'checked' : ''}">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="lista-item-info">
              <div class="lista-item-nome">${item.nome}</div>
              <div class="lista-item-meta">${qtd} ${item.unidade} <span class="badge badge-ok" style="font-size:10px">auto</span></div>
            </div>
            <div class="lista-item-preco">${formatarMoeda(qtd * item.preco)}</div>
            <button class="btn-remover-item" onclick="event.stopPropagation(); deletarProdutoDaLista(${item.id})" title="Excluir produto">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" width="18" height="18"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>`;
      }
    });
  }

  if (manuais.length > 0) {
    html += `<div class="categoria-titulo" style="color:var(--caramelo)">Adicionados Manualmente</div>`;
    manuais.forEach(item => {
      if (_modoSelecaoLista) {
        const sel = _selecionadosListaManual.has(item.id);
        html += `
          <div class="lista-item${sel ? ' selecionado' : ''}" onclick="toggleSelecionadoListaManual(${item.id})">
            <div class="produto-checkbox${sel ? ' checked' : ''}">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="lista-item-info" style="flex:1">
              <div class="lista-item-nome">${item.nome}</div>
              <div class="lista-item-meta">${item.quantidade} <span class="badge badge-manual" style="font-size:10px">manual</span></div>
            </div>
          </div>`;
      } else {
        html += `
          <div class="lista-item ${item.marcado ? 'marcado' : ''}">
            <div class="lista-checkbox ${item.marcado ? 'checked' : ''}" onclick="marcarItemManual(${item.id}, this)">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="lista-item-info" style="flex:1">
              <div class="lista-item-nome">${item.nome}</div>
              <div class="lista-item-meta">${item.quantidade} <span class="badge badge-manual" style="font-size:10px">manual</span></div>
            </div>
            <button class="btn-remover-item" onclick="removerItemManual(${item.id})" title="Remover">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" width="18" height="18"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>`;
      }
    });
  }

  if (!automaticos.length && !manuais.length) {
    html = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      <p>Lista vazia! Todos os itens estão em dia.</p>
    </div>`;
  }

  document.getElementById('conteudo-lista').innerHTML = html;
}

// ─── Modo seleção ──────────────────────────────────────────────────────────

function toggleSelecionadoListaAuto(id) {
  if (_selecionadosListaAuto.has(id)) _selecionadosListaAuto.delete(id);
  else _selecionadosListaAuto.add(id);
  atualizarBarraSelecaoLista();
  renderizarLista();
}

function toggleSelecionadoListaManual(id) {
  if (_selecionadosListaManual.has(id)) _selecionadosListaManual.delete(id);
  else _selecionadosListaManual.add(id);
  atualizarBarraSelecaoLista();
  renderizarLista();
}

function atualizarBarraSelecaoLista() {
  const n = _selecionadosListaAuto.size + _selecionadosListaManual.size;
  const btnExcluir = document.getElementById('btn-excluir-lista');
  if (btnExcluir) {
    btnExcluir.textContent = `Excluir (${n})`;
    btnExcluir.disabled = n === 0;
  }
  const btnTodos = document.getElementById('btn-sel-todos-lista');
  if (btnTodos) {
    const total = _listaAtual.automaticos.length + _listaAtual.manuais.length;
    const todos = total > 0 && n === total &&
      _listaAtual.automaticos.every(i => _selecionadosListaAuto.has(i.id)) &&
      _listaAtual.manuais.every(i => _selecionadosListaManual.has(i.id));
    btnTodos.textContent = todos ? 'Desmarcar todos' : 'Selecionar todos';
  }
}

function _sairModoSelecaoLista() {
  _modoSelecaoLista = false;
  _selecionadosListaAuto.clear();
  _selecionadosListaManual.clear();
  document.body.classList.remove('barra-selecao-ativa');
  const barra = document.getElementById('barra-selecao-lista');
  if (barra) barra.style.display = 'none';
  const btn = document.getElementById('btn-selecionar-lista');
  if (btn) btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 11 12 14 17 8"/></svg> Selecionar`;
}

function toggleModoSelecaoLista() {
  if (_modoSelecaoLista) {
    _sairModoSelecaoLista();
    renderizarLista();
    return;
  }
  _modoSelecaoLista = true;
  document.body.classList.add('barra-selecao-ativa');
  const barra = document.getElementById('barra-selecao-lista');
  if (barra) barra.style.display = 'flex';
  const btn = document.getElementById('btn-selecionar-lista');
  if (btn) btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cancelar`;
  atualizarBarraSelecaoLista();
  renderizarLista();
}

function selecionarTodosLista() {
  const total = _listaAtual.automaticos.length + _listaAtual.manuais.length;
  const n = _selecionadosListaAuto.size + _selecionadosListaManual.size;
  const todos = total > 0 && n === total &&
    _listaAtual.automaticos.every(i => _selecionadosListaAuto.has(i.id)) &&
    _listaAtual.manuais.every(i => _selecionadosListaManual.has(i.id));

  if (todos) {
    _selecionadosListaAuto.clear();
    _selecionadosListaManual.clear();
  } else {
    _listaAtual.automaticos.forEach(i => _selecionadosListaAuto.add(i.id));
    _listaAtual.manuais.forEach(i => _selecionadosListaManual.add(i.id));
  }
  atualizarBarraSelecaoLista();
  renderizarLista();
}

async function excluirSelecionadosLista() {
  const autoIds = [..._selecionadosListaAuto];
  const manualIds = [..._selecionadosListaManual];
  if (!autoIds.length && !manualIds.length) return;

  const msg = autoIds.length > 0
    ? `Atenção: ${autoIds.length} item(ns) desta seleção são produtos do estoque. Excluí-los aqui REMOVE o produto do estoque permanentemente, junto com seu histórico. Continuar?`
    : `Excluir ${manualIds.length} item(ns) da lista?`;
  if (!confirm(msg)) return;

  try {
    const res = await api('/api/lista/excluir-lote', {
      method: 'POST',
      body: { manuais: manualIds, produtos: autoIds }
    });

    if (autoIds.length) {
      _listaAtual.automaticos = _listaAtual.automaticos.filter(i => !autoIds.includes(i.id));
      autoIds.forEach(id => _marcadosAuto.delete(id));
    }
    if (manualIds.length) {
      _listaAtual.manuais = _listaAtual.manuais.filter(i => !manualIds.includes(i.id));
    }

    _sairModoSelecaoLista();
    renderizarLista();

    const totalExcluidos = (res.manuais_excluidos || 0) + (res.produtos_excluidos || 0);
    toast(`${totalExcluidos} item(ns) excluído(s)`, 'sucesso');
  } catch (e) {
    toast('Erro ao excluir itens. Tente novamente.', 'erro');
  }
}

// ─── Funções existentes ────────────────────────────────────────────────────

function marcarItemAuto(id) {
  if (_marcadosAuto.has(id)) _marcadosAuto.delete(id);
  else _marcadosAuto.add(id);
  renderizarLista();
}

async function marcarItemManual(id, checkEl) {
  try {
    const res = await api(`/api/lista/manual/${id}/marcar`, { method: 'PUT' });
    const item = _listaAtual.manuais.find(m => m.id === id);
    if (item) item.marcado = res.marcado;
    renderizarLista();
  } catch (e) {
    toast('Erro ao marcar item', 'erro');
  }
}

async function deletarProdutoDaLista(id) {
  const item = _listaAtual.automaticos.find(i => i.id === id);
  if (!item) return;
  if (!confirm(`Excluir "${item.nome}" permanentemente? Esta ação não pode ser desfeita.`)) return;
  try {
    await api(`/api/produtos/${id}`, { method: 'DELETE' });
    _listaAtual.automaticos = _listaAtual.automaticos.filter(i => i.id !== id);
    _marcadosAuto.delete(id);
    renderizarLista();
    toast('Produto excluído', 'sucesso');
  } catch (e) {
    toast('Erro ao excluir produto', 'erro');
  }
}

async function removerItemManual(id) {
  try {
    await api(`/api/lista/manual/${id}`, { method: 'DELETE' });
    _listaAtual.manuais = _listaAtual.manuais.filter(m => m.id !== id);
    renderizarLista();
  } catch (e) {
    toast('Erro ao remover item', 'erro');
  }
}

function adicionarItemManual() {
  document.getElementById('item-manual-nome').value = '';
  document.getElementById('item-manual-qtd').value = '';
  document.getElementById('modal-item-manual').classList.add('aberto');
  setTimeout(() => document.getElementById('item-manual-nome').focus(), 300);
}

function fecharModalItemManual() {
  document.getElementById('modal-item-manual').classList.remove('aberto');
}

async function confirmarItemManual() {
  const nome = document.getElementById('item-manual-nome').value.trim();
  const qtd = document.getElementById('item-manual-qtd').value.trim();
  if (!nome) { toast('Informe o nome do item', 'erro'); return; }
  try {
    const item = await api('/api/lista/manual', { method: 'POST', body: { nome, quantidade: qtd || '1' } });
    _listaAtual.manuais.push({ ...item, tipo: 'manual' });
    renderizarLista();
    fecharModalItemManual();
    toast('Item adicionado!', 'sucesso');
  } catch (e) {
    toast('Erro ao adicionar item', 'erro');
  }
}

document.getElementById('item-manual-nome')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('item-manual-qtd').focus();
});
document.getElementById('item-manual-qtd')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmarItemManual();
});

document.getElementById('modal-item-manual')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modal-item-manual')) fecharModalItemManual();
});

async function registrarFeiraDaLista() {
  const { automaticos } = _listaAtual;
  if (!automaticos.length) { toast('Nenhum item para registrar', 'erro'); return; }
  if (!confirm('Registrar a feira de hoje? Isso vai salvar os dados e limpar os itens marcados.')) return;

  const valorTotal = automaticos.reduce((s, i) => s + Math.ceil(i.quantidade_sugerida) * i.preco, 0);
  const itens = automaticos.map(i => ({
    produto_id: i.id,
    nome_produto: i.nome,
    quantidade: Math.ceil(i.quantidade_sugerida),
    preco_unitario: i.preco
  }));

  try {
    await api('/api/feiras/registrar', {
      method: 'POST',
      body: { data: new Date().toISOString().split('T')[0], valor_total: valorTotal, itens }
    });
    _marcadosAuto.clear();
    toast('Feira registrada!', 'sucesso');
    await carregarLista();
  } catch (e) {
    toast('Erro ao registrar feira', 'erro');
  }
}

async function compartilharWhatsapp() {
  const { automaticos, manuais } = _listaAtual;
  let texto = '*Lista de Compras — Feira-Certa*\n\n';
  if (automaticos.length) {
    texto += '*Do Estoque:*\n';
    automaticos.forEach(i => { texto += `• ${i.nome} — ${Math.ceil(i.quantidade_sugerida)} ${i.unidade}\n`; });
    texto += '\n';
  }
  if (manuais.length) {
    texto += '*Adicionais:*\n';
    manuais.forEach(i => { texto += `• ${i.nome} — ${i.quantidade}\n`; });
  }
  window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
}

async function exportarPDF() {
  try {
    const res = await fetch(((window.ENV || {}).API_URL || '') + '/api/lista/pdf', {
      headers: { 'X-App-Token': (window.ENV || {}).APP_SECRET_TOKEN || '' }
    });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  } catch (e) {
    toast('Erro ao gerar PDF', 'erro');
  }
}

// ─── Modo Feira ────────────────────────────────────────────────────────────

let _itensModoFeira = [];

function abrirModoFeira() {
  const { automaticos, manuais } = _listaAtual;
  _itensModoFeira = [
    ...automaticos.map(i => ({ id: 'a_' + i.id, nome: i.nome, qtd: `${Math.ceil(i.quantidade_sugerida)} ${i.unidade}`, marcado: _marcadosAuto.has(i.id) })),
    ...manuais.map(i => ({ id: 'm_' + i.id, nome: i.nome, qtd: i.quantidade, marcado: !!i.marcado }))
  ];
  renderizarModoFeira();
  document.getElementById('modo-feira').classList.add('ativo');
}

function renderizarModoFeira() {
  const el = document.getElementById('itens-modo-feira');
  el.innerHTML = _itensModoFeira.map((item, idx) => `
    <div class="modo-feira-item ${item.marcado ? 'marcado' : ''}" onclick="toggleModoFeira(${idx})">
      <div class="modo-feira-check">${item.marcado ? '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" width="20" height="20"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</div>
      <div>
        <div class="modo-feira-nome">${item.nome}</div>
        <div class="modo-feira-qtd">${item.qtd}</div>
      </div>
    </div>`).join('');
}

function toggleModoFeira(idx) {
  _itensModoFeira[idx].marcado = !_itensModoFeira[idx].marcado;

  _itensModoFeira.forEach(item => {
    if (item.id.startsWith('a_')) {
      const id = parseInt(item.id.replace('a_', ''));
      if (item.marcado) _marcadosAuto.add(id);
      else _marcadosAuto.delete(id);
    }
  });

  renderizarModoFeira();
}

function fecharModoFeira() {
  document.getElementById('modo-feira').classList.remove('ativo');
  renderizarLista();
}
