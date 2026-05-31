let _produtoSelecionadoConsumo = null;

function abrirModalConsumo() {
  document.getElementById('busca-consumo').value = '';
  document.getElementById('resultados-busca-consumo').innerHTML = '';
  document.getElementById('form-consumo').style.display = 'none';
  document.getElementById('modal-consumo').classList.add('aberto');
  setTimeout(() => document.getElementById('busca-consumo').focus(), 300);
}

function fecharModalConsumo() {
  document.getElementById('modal-consumo').classList.remove('aberto');
  _produtoSelecionadoConsumo = null;
}

document.getElementById('modal-consumo')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modal-consumo')) fecharModalConsumo();
});

let _debounceConsumoBusca;
async function buscarProdutoConsumo(q) {
  clearTimeout(_debounceConsumoBusca);
  _debounceConsumoBusca = setTimeout(async () => {
    if (!q.trim()) {
      document.getElementById('resultados-busca-consumo').innerHTML = '';
      return;
    }
    try {
      const produtos = await api(`/api/produtos/buscar?q=${encodeURIComponent(q)}`);
      const el = document.getElementById('resultados-busca-consumo');
      if (!produtos.length) {
        el.innerHTML = `<p style="color:var(--texto-sec);font-size:14px;padding:8px 0">Nenhum produto encontrado.</p>`;
        return;
      }
      el.innerHTML = produtos.slice(0, 5).map(p => `
        <div class="produto-item" style="cursor:pointer;margin-bottom:6px" onclick="selecionarProdutoConsumo(${p.id},'${p.nome.replace(/'/g, "\\'")}',${p.quantidade_atual})">
          <div class="produto-info">
            <div class="produto-nome">${p.nome}</div>
            <div class="produto-preco">Atual: ${p.quantidade_atual} ${p.unidade}</div>
          </div>
          <span class="badge ${p.quantidade_atual < p.quantidade_minima ? 'badge-baixo' : 'badge-ok'}">
            ${p.quantidade_atual < p.quantidade_minima ? 'Baixo' : 'OK'}
          </span>
        </div>`).join('');
    } catch (e) {}
  }, 300);
}

function selecionarProdutoConsumo(id, nome, qtdAtual) {
  _produtoSelecionadoConsumo = { id, nome, qtdAtual };
  document.getElementById('resultados-busca-consumo').innerHTML = '';
  document.getElementById('form-consumo').style.display = 'block';
  document.getElementById('consumo-produto-nome').textContent = nome;
  document.getElementById('consumo-qtd-atual').textContent = qtdAtual;
  document.getElementById('consumo-nova-qtd').value = '';
  setTimeout(() => document.getElementById('consumo-nova-qtd').focus(), 100);
}

async function confirmarConsumo() {
  if (!_produtoSelecionadoConsumo) return;
  const novaQtd = parseFloat(document.getElementById('consumo-nova-qtd').value);
  if (isNaN(novaQtd) || novaQtd < 0) { toast('Informe uma quantidade válida', 'erro'); return; }

  try {
    const res = await api('/api/consumo/registrar', {
      method: 'POST',
      body: { produto_id: _produtoSelecionadoConsumo.id, quantidade_nova: novaQtd }
    });

    fecharModalConsumo();

    if (res.produto.quantidade_atual < res.produto.quantidade_minima) {
      toast(`${res.produto.nome} está abaixo do mínimo!`, 'erro');
    } else {
      toast('Consumo registrado!', 'sucesso');
    }

    // Atualizar dashboard se estiver visível
    if (document.getElementById('pg-inicio').classList.contains('ativa')) {
      carregarDashboard();
    }
  } catch (e) {
    toast('Erro ao registrar consumo', 'erro');
  }
}

document.getElementById('consumo-nova-qtd')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmarConsumo();
});

