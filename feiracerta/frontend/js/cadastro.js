let _produtoEditando = null;

function novoCadastro() {
  _produtoEditando = null;
  document.getElementById('cadastro-id').value = '';
  document.getElementById('cadastro-titulo').textContent = 'Cadastrar Produto';
  ['c-nome','c-marca','c-codigo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['c-qtd-atual','c-qtd-min','c-preco'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('c-categoria').value = '';
  document.getElementById('c-unidade').value = 'Unidade';
  document.getElementById('c-categoria-nova').style.display = 'none';
  document.getElementById('historico-precos-cadastro').style.display = 'none';
}

function preencherFormularioCadastro(p) {
  _produtoEditando = p;
  document.getElementById('cadastro-id').value = p.id;
  document.getElementById('cadastro-titulo').textContent = 'Editar Produto';
  document.getElementById('c-nome').value = p.nome || '';
  document.getElementById('c-marca').value = p.marca || '';
  document.getElementById('c-codigo').value = p.codigo_barras || '';
  document.getElementById('c-qtd-atual').value = p.quantidade_atual ?? '';
  document.getElementById('c-qtd-min').value = p.quantidade_minima ?? '';
  document.getElementById('c-preco').value = p.preco ?? '';
  document.getElementById('c-unidade').value = p.unidade || 'Unidade';

  const catSelect = document.getElementById('c-categoria');
  let optExists = [...catSelect.options].some(o => o.value === p.categoria);
  if (!optExists && p.categoria) {
    const opt = new Option(p.categoria, p.categoria);
    catSelect.insertBefore(opt, catSelect.lastElementChild);
  }
  catSelect.value = p.categoria || '';

  if (p.historico_precos?.length >= 2) {
    document.getElementById('historico-precos-cadastro').style.display = 'block';
    setTimeout(() => {
      const labels = p.historico_precos.map(h => formatarData(h.registrado_em).slice(0, 5));
      const valores = p.historico_precos.map(h => h.preco);
      desenharGrafico('canvas-precos-cadastro', labels, valores, '#C9956E');
    }, 100);
  }
}

document.getElementById('c-categoria')?.addEventListener('change', function () {
  const nova = document.getElementById('c-categoria-nova');
  nova.style.display = this.value === '__nova__' ? 'block' : 'none';
  if (this.value === '__nova__') nova.focus();
});

async function salvarProduto() {
  const id = document.getElementById('cadastro-id').value;
  const catSelect = document.getElementById('c-categoria');
  let categoria = catSelect.value === '__nova__'
    ? document.getElementById('c-categoria-nova').value.trim()
    : catSelect.value;

  const dados = {
    nome: document.getElementById('c-nome').value.trim(),
    categoria: categoria,
    unidade: document.getElementById('c-unidade').value,
    quantidade_atual: parseFloat(document.getElementById('c-qtd-atual').value) || 0,
    quantidade_minima: parseFloat(document.getElementById('c-qtd-min').value) || 1,
    preco: parseFloat(document.getElementById('c-preco').value) || 0,
    marca: document.getElementById('c-marca').value.trim() || undefined,
    codigo_barras: document.getElementById('c-codigo').value.trim() || undefined
  };

  if (!dados.nome || !dados.categoria) {
    toast('Preencha nome e categoria', 'erro');
    return;
  }

  try {
    if (id) {
      await api(`/api/produtos/${id}`, { method: 'PUT', body: dados });
      toast('Produto atualizado!', 'sucesso');
    } else {
      await api('/api/produtos', { method: 'POST', body: dados });
      toast('Produto cadastrado!', 'sucesso');
      novoCadastro();
    }
  } catch (e) {
    if (e.message.includes('código de barras')) {
      toast('Código de barras já cadastrado em outro produto', 'erro');
    } else {
      toast(e.message || 'Erro ao salvar', 'erro');
    }
  }
}


async function verificarCodigoExistente(codigo) {
  try {
    const produtos = await api(`/api/produtos/buscar?q=${encodeURIComponent(codigo)}`);
    const existente = produtos.find(p => p.codigo_barras === codigo);
    if (existente) {
      toast(`Produto "${existente.nome}" já cadastrado com este código`, 'erro');
      preencherFormularioCadastro(existente);
    }
  } catch (e) {}
}
