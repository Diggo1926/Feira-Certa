let _filaNovos = [];
let _produtosParaConfirmar = [];
let _dadosFeira = null;
let _categoriasCache = null;

function fotografarCupom() {
  document.getElementById('input-foto-cupom').click();
}

function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function processarFotoCupom(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  _mostrarTela('loading');

  try {
    const imagem = await _fileToBase64(file);
    const dados = await api('/api/nota/foto', {
      method: 'POST',
      body: { imagem, mimeType: file.type }
    });
    mostrarConfirmacao(dados);
  } catch (e) {
    _mostrarTela('etapa-1');
    toast(e.message || 'Erro ao ler cupom', 'erro');
  }
}

function _mostrarTela(qual) {
  ['etapa-1', 'loading', 'etapa-2', 'manual'].forEach(t => {
    const el = document.getElementById(`feira-${t}`);
    if (el) el.style.display = 'none';
  });
  const alvo = document.getElementById(`feira-${qual}`);
  if (alvo) alvo.style.display = 'block';
}

function _converterDataBR(dataBR) {
  if (!dataBR) return new Date().toISOString().split('T')[0];
  const p = String(dataBR).split('/');
  if (p.length !== 3) return new Date().toISOString().split('T')[0];
  const ano = p[2].length === 2 ? '20' + p[2] : p[2];
  return `${ano}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
}

function _escapar(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function mostrarConfirmacao(dados) {
  _dadosFeira = dados;
  const etapa2 = document.getElementById('feira-etapa-2');
  const dataISO = _converterDataBR(dados.data);
  const valor = dados.valor_total != null ? Number(dados.valor_total).toFixed(2) : '';
  const produtos = dados.produtos || [];

  const produtosHTML = produtos.map((p, i) => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:12px;background:#f9f9f7;border-radius:10px;margin-bottom:8px;border:1px solid #eee">
      <input type="checkbox" id="prod-check-${i}" checked style="margin-top:3px;width:18px;height:18px;cursor:pointer;flex-shrink:0;accent-color:var(--musgo)">
      <div style="flex:1;min-width:0">
        <input type="text" id="prod-nome-${i}" value="${_escapar(p.nome)}"
          style="width:100%;border:none;background:transparent;font-size:14px;font-weight:600;color:var(--texto);padding:0;margin-bottom:8px;outline:none">
        <div style="display:flex;gap:8px">
          <div style="flex:1">
            <div style="font-size:11px;color:var(--texto-sec);margin-bottom:3px;text-transform:uppercase;letter-spacing:.3px">Qtd</div>
            <input type="number" id="prod-qtd-${i}" value="${p.quantidade ?? 1}" step="0.001" min="0"
              style="width:100%;border:1px solid #ddd;border-radius:6px;padding:5px 7px;font-size:13px">
          </div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--texto-sec);margin-bottom:3px;text-transform:uppercase;letter-spacing:.3px">R$ unit.</div>
            <input type="number" id="prod-preco-${i}" value="${p.preco_unitario ?? ''}" step="0.01" min="0" placeholder="0,00"
              style="width:100%;border:1px solid #ddd;border-radius:6px;padding:5px 7px;font-size:13px">
          </div>
        </div>
      </div>
    </div>
  `).join('');

  etapa2.innerHTML = `
    <div class="tela-header" style="margin-bottom:16px">
      <button class="btn btn-secundario btn-sm btn-icon" onclick="voltarEtapa1()">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="tela-titulo" style="font-size:16px">Confirmar Feira</div>
    </div>
    <div class="campo">
      <label for="confirmacao-data">Data da Compra</label>
      <input type="date" id="confirmacao-data" value="${dataISO}">
    </div>
    <div class="campo">
      <label for="confirmacao-valor">Valor Total (R$)</label>
      <input type="number" id="confirmacao-valor" value="${valor}" step="0.01" min="0" placeholder="0,00" inputmode="decimal">
    </div>
    <div style="margin:16px 0 8px;font-weight:600;font-size:14px;color:var(--texto)">${produtos.length} produto(s) extraído(s)</div>
    <p style="font-size:12px;color:var(--texto-sec);margin-bottom:10px">
      Marque os produtos que deseja adicionar ao estoque. Você pode editar nome, quantidade e preço.
    </p>
    <div id="lista-confirmacao">${produtosHTML}</div>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid #eee">
      <button class="btn btn-primario" style="width:100%" onclick="confirmarFeira()">Confirmar Feira</button>
    </div>
  `;

  _mostrarTela('etapa-2');
}

function _coletarProdutosChecked() {
  const produtos = _dadosFeira?.produtos || [];
  return produtos.reduce((acc, _, i) => {
    const check = document.getElementById(`prod-check-${i}`);
    if (!check?.checked) return acc;
    const nome = document.getElementById(`prod-nome-${i}`)?.value?.trim();
    const qtd = parseFloat(document.getElementById(`prod-qtd-${i}`)?.value) || 0;
    const preco = parseFloat(document.getElementById(`prod-preco-${i}`)?.value) || 0;
    if (nome && qtd > 0) acc.push({ nome, quantidade: qtd, preco_unitario: preco });
    return acc;
  }, []);
}

async function confirmarFeira() {
  const data = document.getElementById('confirmacao-data')?.value;
  const valorTotal = parseFloat(document.getElementById('confirmacao-valor')?.value) || 0;
  if (!data) { toast('Informe a data da feira', 'erro'); return; }

  const selecionados = _coletarProdutosChecked();

  if (selecionados.length === 0) {
    try {
      await api('/api/feiras/registrar', { method: 'POST', body: { data, valor_total: valorTotal, itens: [] } });
      toast('Feira registrada!', 'sucesso');
      voltarEtapa1();
      irPara('pg-historico');
    } catch (e) {
      toast('Erro ao registrar feira: ' + (e.message || ''), 'erro');
    }
    return;
  }

  let todosProdutos = [];
  try { todosProdutos = await api('/api/produtos'); } catch (_) {}

  const comId = selecionados.map(p => {
    const match = todosProdutos.find(ep => ep.nome.toLowerCase() === p.nome.toLowerCase());
    return { ...p, produto_id: match?.id || null, _novo: !match };
  });

  _produtosParaConfirmar = comId.filter(p => !p._novo);
  _filaNovos = comId.filter(p => p._novo);
  _dadosFeira._dataConfirmacao = data;
  _dadosFeira._valorTotalConfirmacao = valorTotal;

  if (_filaNovos.length > 0) {
    await _carregarCategorias();
    _mostrarModalNovoProduto(_filaNovos[0]);
  } else {
    _enviarConfirmacao();
  }
}

async function _carregarCategorias() {
  if (_categoriasCache) return;
  try {
    _categoriasCache = await api('/api/produtos/categorias');
  } catch (_) {
    _categoriasCache = ['Alimentos', 'Bebidas', 'Higiene', 'Limpeza', 'Outros'];
  }
}

function _mostrarModalNovoProduto(produto) {
  const modal = document.getElementById('modal-novo-produto');
  document.getElementById('modal-np-nome').textContent = produto.nome;
  const cats = _categoriasCache || ['Alimentos', 'Bebidas', 'Higiene', 'Limpeza', 'Outros'];
  document.getElementById('modal-np-categoria').innerHTML =
    cats.map(c => `<option value="${_escapar(c)}">${c}</option>`).join('');
  document.getElementById('modal-np-qtd-min').value = '1';
  modal.style.display = 'flex';
}

function _fecharModalNovoProduto() {
  const modal = document.getElementById('modal-novo-produto');
  if (modal) modal.style.display = 'none';
}

function confirmarNovoProduto() {
  const categoria = document.getElementById('modal-np-categoria').value;
  const qtdMin = parseFloat(document.getElementById('modal-np-qtd-min').value) || 1;
  const produto = _filaNovos.shift();
  _produtosParaConfirmar.push({ ...produto, cadastrar: true, categoria, quantidade_minima: qtdMin });
  _avancarModalOuEnviar();
}

function pularNovoProduto() {
  _filaNovos.shift();
  _avancarModalOuEnviar();
}

function _avancarModalOuEnviar() {
  if (_filaNovos.length > 0) {
    _mostrarModalNovoProduto(_filaNovos[0]);
  } else {
    _fecharModalNovoProduto();
    _enviarConfirmacao();
  }
}

async function _enviarConfirmacao() {
  const data = _dadosFeira._dataConfirmacao;
  const valorTotal = _dadosFeira._valorTotalConfirmacao;

  if (_produtosParaConfirmar.length === 0) {
    try {
      await api('/api/feiras/registrar', { method: 'POST', body: { data, valor_total: valorTotal, itens: [] } });
      toast('Feira registrada!', 'sucesso');
      voltarEtapa1();
      irPara('pg-historico');
    } catch (e) {
      toast('Erro ao registrar feira: ' + (e.message || ''), 'erro');
    }
    return;
  }

  try {
    await api('/api/nota/confirmar', {
      method: 'POST',
      body: { produtos: _produtosParaConfirmar, data, valor_total: valorTotal }
    });
    toast('Feira registrada com sucesso!', 'sucesso');
    voltarEtapa1();
    irPara('pg-historico');
  } catch (e) {
    toast('Erro ao registrar feira: ' + (e.message || ''), 'erro');
  }
}

function voltarEtapa1() {
  _filaNovos = [];
  _produtosParaConfirmar = [];
  _dadosFeira = null;
  _fecharModalNovoProduto();
  _mostrarTela('etapa-1');
}

function mostrarRegistroManual() {
  _mostrarTela('manual');
  document.getElementById('feira-manual-data').value = new Date().toISOString().split('T')[0];
}

async function confirmarFeiraManual() {
  const data = document.getElementById('feira-manual-data').value;
  const valor = parseFloat(document.getElementById('feira-manual-valor').value) || 0;
  if (!data) { toast('Informe a data', 'erro'); return; }
  try {
    await api('/api/feiras/registrar', { method: 'POST', body: { data, valor_total: valor, itens: [] } });
    toast('Feira registrada!', 'sucesso');
    voltarEtapa1();
    irPara('pg-historico');
  } catch (e) {
    toast('Erro ao registrar feira: ' + (e.message || ''), 'erro');
  }
}
