let _produtoEditando = null;
let _categoriasDropdown = [];

// ─── Categorias dinâmicas ──────────────────────────────────────────────────

async function carregarCategoriasCadastro(forceReload = false) {
  if (_categoriasDropdown.length && !forceReload) return;
  try {
    _categoriasDropdown = await api('/api/categorias');
  } catch (e) {
    // mantém o que estava carregado
  }
  const select = document.getElementById('c-categoria');
  if (select) _preencherSelectCategorias(select, select.value);
}

function _preencherSelectCategorias(select, valorSelecionado) {
  const prev = valorSelecionado || select.value;
  select.innerHTML =
    '<option value="">Selecionar...</option>' +
    _categoriasDropdown.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('') +
    '<option value="__nova__">+ Nova categoria...</option>';
  // Tenta restaurar seleção anterior
  if (prev && prev !== '__nova__') {
    select.value = prev;
    // Se não encontrou (categoria pode ter sido renomeada), limpa
    if (select.value !== prev) select.value = '';
  }
}

async function criarCategoriaRapida() {
  const input = document.getElementById('c-categoria-nova');
  const erroEl = document.getElementById('c-categoria-nova-erro');
  const nome = input?.value?.trim();

  if (!nome) {
    erroEl.textContent = 'Digite o nome da categoria';
    erroEl.style.display = 'block';
    return;
  }
  erroEl.style.display = 'none';

  try {
    const nova = await api('/api/categorias', { method: 'POST', body: { nome } });
    _categoriasDropdown.push(nova);
    _categoriasDropdown.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const select = document.getElementById('c-categoria');
    _preencherSelectCategorias(select, nova.nome);
    document.getElementById('c-categoria-nova-wrap').style.display = 'none';
    toast('Categoria criada!', 'sucesso');
  } catch (e) {
    erroEl.textContent = e.message.includes('já existe')
      ? 'Categoria já existe — selecione-a no menu'
      : (e.message || 'Erro ao criar categoria');
    erroEl.style.display = 'block';
    if (e.message.includes('já existe')) await carregarCategoriasCadastro(true);
  }
}

// ─── Formulário ───────────────────────────────────────────────────────────

function novoCadastro() {
  _produtoEditando = null;
  document.getElementById('cadastro-id').value = '';
  document.getElementById('cadastro-titulo').textContent = 'Cadastrar Produto';
  ['c-nome','c-marca','c-codigo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['c-qtd-atual','c-qtd-min','c-preco'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('c-categoria').value = '';
  document.getElementById('c-unidade').value = 'Unidade';
  document.getElementById('c-categoria-nova-wrap').style.display = 'none';
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
  // Garante que a categoria do produto está disponível no dropdown
  const existe = _categoriasDropdown.some(c => c.nome === p.categoria);
  if (!existe && p.categoria) {
    // Adiciona temporariamente para não perder o valor ao editar
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
  const wrap = document.getElementById('c-categoria-nova-wrap');
  if (!wrap) return;
  const abrir = this.value === '__nova__';
  wrap.style.display = abrir ? 'block' : 'none';
  if (abrir) {
    document.getElementById('c-categoria-nova').value = '';
    document.getElementById('c-categoria-nova-erro').style.display = 'none';
    document.getElementById('c-categoria-nova').focus();
  }
});

document.getElementById('c-categoria-nova')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); criarCategoriaRapida(); }
  if (e.key === 'Escape') {
    document.getElementById('c-categoria-nova-wrap').style.display = 'none';
    document.getElementById('c-categoria').value = '';
  }
});

async function salvarProduto() {
  const id = document.getElementById('cadastro-id').value;
  const catSelect = document.getElementById('c-categoria');
  let categoria = catSelect.value;

  // Se ainda está em __nova__, tenta criar a categoria antes de salvar
  if (categoria === '__nova__') {
    const nomeNovo = document.getElementById('c-categoria-nova')?.value?.trim();
    if (!nomeNovo) {
      toast('Digite e clique em "Criar" para confirmar a nova categoria', 'erro');
      return;
    }
    try {
      const nova = await api('/api/categorias', { method: 'POST', body: { nome: nomeNovo } });
      _categoriasDropdown.push(nova);
      _categoriasDropdown.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      _preencherSelectCategorias(catSelect, nova.nome);
      document.getElementById('c-categoria-nova-wrap').style.display = 'none';
      categoria = nova.nome;
    } catch (e) {
      const msg = e.message.includes('já existe')
        ? 'Essa categoria já existe — selecione-a no dropdown'
        : (e.message || 'Erro ao criar categoria');
      toast(msg, 'erro');
      if (e.message.includes('já existe')) await carregarCategoriasCadastro(true);
      return;
    }
  }

  const dados = {
    nome: document.getElementById('c-nome').value.trim(),
    categoria,
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
