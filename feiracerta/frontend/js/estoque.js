let _produtos = [];

async function carregarEstoque(filtro = '') {
  const el = document.getElementById('lista-estoque');
  el.innerHTML = loading();
  try {
    const produtos = filtro
      ? await api(`/api/produtos/buscar?q=${encodeURIComponent(filtro)}`)
      : await api('/api/produtos');
    _produtos = produtos;
    renderizarEstoque(produtos);
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><p>Erro ao carregar estoque.</p></div>`;
  }
}

function renderizarEstoque(produtos) {
  const el = document.getElementById('lista-estoque');
  if (!produtos.length) {
    el.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 2 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      <p>Nenhum produto cadastrado.<br>Toque em <strong>Cadastrar</strong> para começar.</p>
    </div>`;
    return;
  }

  const grupos = {};
  produtos.forEach(p => {
    if (!grupos[p.categoria]) grupos[p.categoria] = [];
    grupos[p.categoria].push(p);
  });

  let html = '';
  Object.keys(grupos).sort().forEach(cat => {
    html += `<div class="categoria-titulo">${cat}</div>`;
    grupos[cat].forEach(p => {
      const baixo = p.quantidade_atual < p.quantidade_minima;
      html += `
        <div class="produto-item" onclick="abrirEdicao(${p.id})">
          <div class="produto-info">
            <div class="produto-nome">${p.nome}</div>
            <div class="produto-preco">${formatarMoeda(p.preco)} · ${p.marca || p.unidade}</div>
          </div>
          <span class="badge ${baixo ? 'badge-baixo' : 'badge-ok'}">${baixo ? 'Baixo' : 'OK'}</span>
          <div class="qty-control" onclick="event.stopPropagation()">
            <button class="qty-btn" onclick="alterarQtd(${p.id}, -1)">−</button>
            <span class="qty-val">${p.quantidade_atual % 1 === 0 ? p.quantidade_atual : p.quantidade_atual.toFixed(1)}</span>
            <button class="qty-btn" onclick="alterarQtd(${p.id}, 1)">+</button>
          </div>
          <button class="btn-remover-item" onclick="event.stopPropagation(); deletarProduto(${p.id})" title="Excluir produto">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" width="18" height="18"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>`;
    });
  });

  el.innerHTML = html;
}

async function alterarQtd(id, delta) {
  const p = _produtos.find(x => x.id === id);
  if (!p) return;
  const novaQtd = Math.max(0, p.quantidade_atual + delta);
  try {
    await api(`/api/consumo/registrar`, { method: 'POST', body: { produto_id: id, quantidade_nova: novaQtd } });
    p.quantidade_atual = novaQtd;
    renderizarEstoque(_produtos);
  } catch (e) {
    toast('Erro ao atualizar quantidade', 'erro');
  }
}

async function abrirEdicao(id) {
  const p = _produtos.find(x => x.id === id);
  if (!p) return;
  irPara('pg-cadastro');
  await carregarCategoriasCadastro();
  preencherFormularioCadastro(p);
}

document.getElementById('busca-estoque')?.addEventListener('input', e => {
  carregarEstoque(e.target.value);
});

// Toque longo para editar
let _longPressTimer = null;
document.getElementById('lista-estoque')?.addEventListener('touchstart', e => {
  const item = e.target.closest('.produto-item');
  if (!item) return;
  _longPressTimer = setTimeout(() => {
    const id = parseInt(item.querySelector('.qty-btn').getAttribute('onclick').match(/\d+/)[0]);
    abrirEdicao(id);
  }, 600);
});
document.getElementById('lista-estoque')?.addEventListener('touchend', () => clearTimeout(_longPressTimer));

async function deletarProduto(id) {
  const p = _produtos.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Excluir "${p.nome}" permanentemente? Esta ação não pode ser desfeita.`)) return;
  try {
    await api(`/api/produtos/${id}`, { method: 'DELETE' });
    _produtos = _produtos.filter(x => x.id !== id);
    renderizarEstoque(_produtos);
    toast('Produto excluído', 'sucesso');
  } catch (e) {
    toast('Erro ao excluir produto', 'erro');
  }
}
