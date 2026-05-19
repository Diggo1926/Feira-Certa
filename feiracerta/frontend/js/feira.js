let _scannerNota = null;
let _produtosNota = [];

function iniciarScannerNota() {
  const div = document.getElementById('scanner-nota');
  div.style.display = 'block';
  div.innerHTML = '';
  if (_scannerNota) _scannerNota.stop?.();

  _scannerNota = new Html5Qrcode('scanner-nota');
  _scannerNota.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 260, height: 200 } },
    (decoded) => {
      pararScannerNota();
      processarURLDecodificada(decoded);
    },
    () => {}
  ).catch(() => toast('Não foi possível acessar a câmera', 'erro'));
}

function pararScannerNota() {
  if (_scannerNota) {
    _scannerNota.stop?.().catch(() => {}).finally(() => {
      _scannerNota = null;
      const div = document.getElementById('scanner-nota');
      if (div) { div.innerHTML = ''; div.style.display = 'none'; }
    });
  }
}

async function processarURLDecodificada(url) {
  document.getElementById('url-nota').value = url;
  await processarURLNota();
}

async function _enviarParaProcessar(body) {
  const etapa1 = document.getElementById('feira-etapa-1');
  const etapa2 = document.getElementById('feira-etapa-2');

  etapa1.style.display = 'none';
  etapa2.style.display = 'block';
  etapa2.innerHTML = loading();

  try {
    const res = await api('/api/nota/processar', { method: 'POST', body });
    _produtosNota = res.produtos;
    renderizarRevisaoNota(res);
  } catch (e) {
    etapa2.innerHTML = `
      <div class="card-alerta card">
        <div class="card-alerta-titulo">Não foi possível processar a nota</div>
        <div class="card-alerta-texto">${e.message}</div>
      </div>
      <button class="btn btn-secundario" style="width:100%;margin-top:10px" onclick="voltarEtapa1()">Tentar Novamente</button>
      <button class="btn btn-primario" style="width:100%;margin-top:10px" onclick="mostrarRegistroManual()">Registrar Manualmente</button>`;
  }
}

async function processarURLNota() {
  const url = document.getElementById('url-nota').value.trim();
  if (!url) { toast('Cole ou leia a URL da nota fiscal', 'erro'); return; }
  await _enviarParaProcessar({ url });
}

async function processarChaveAcesso() {
  const chave = document.getElementById('chave-nota').value.trim().replace(/\D/g, '');
  if (chave.length !== 44) { toast('A chave de acesso deve ter exatamente 44 dígitos', 'erro'); return; }
  await _enviarParaProcessar({ chave });
}

function voltarEtapa1() {
  document.getElementById('feira-etapa-1').style.display = 'block';
  document.getElementById('feira-etapa-2').style.display = 'none';
  document.getElementById('feira-etapa-2').innerHTML = '';
}

function renderizarRevisaoNota(dados) {
  const el = document.getElementById('feira-etapa-2');
  const total = dados.total || 0;
  const novos = dados.produtos.filter(p => p.novo).length;

  let html = `
    <div class="tela-header" style="margin-bottom:8px">
      <div class="tela-titulo">Revisar Nota</div>
      <button class="btn btn-secundario btn-sm" onclick="voltarEtapa1()">Voltar</button>
    </div>
    <div class="card-mini" style="margin-bottom:14px">
      <div class="card-mini-label">Total da Nota</div>
      <div class="card-mini-valor">${formatarMoeda(total)}</div>
      <div class="card-mini-sub">${dados.produtos.length} produtos · ${novos} novos</div>
    </div>`;

  dados.produtos.forEach((p, idx) => {
    const cadastrar = !p.novo;
    html += `
      <div class="nota-produto-card ${p.novo ? 'nota-produto-novo' : ''}" id="nota-prod-${idx}">
        <div class="nota-produto-nome">${p.nome}</div>
        <div class="nota-produto-meta">
          ${p.quantidade} × ${formatarMoeda(p.preco_unitario)}
          ${p.produto_existente ? `· <span style="color:var(--musgo)">✓ ${p.produto_existente.nome}</span>` : ''}
        </div>
        ${p.novo ? `
          <div style="margin-top:10px">
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
              <input type="checkbox" id="cadastrar-${idx}" checked style="width:18px;height:18px;accent-color:var(--caramelo)">
              Cadastrar este produto
            </label>
            <div id="form-novo-${idx}" style="margin-top:8px">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
                <div class="campo" style="margin:0">
                  <label style="font-size:11px">Categoria</label>
                  <select id="nota-cat-${idx}" style="font-size:13px;padding:8px">
                    <option value="Geral">Geral</option>
                    <option value="Grãos e Cereais">Grãos e Cereais</option>
                    <option value="Laticínios">Laticínios</option>
                    <option value="Carnes e Peixes">Carnes e Peixes</option>
                    <option value="Bebidas">Bebidas</option>
                    <option value="Limpeza">Limpeza</option>
                    <option value="Higiene">Higiene</option>
                    <option value="Temperos e Condimentos">Temperos</option>
                    <option value="Massas e Pães">Massas e Pães</option>
                    <option value="Enlatados e Conservas">Enlatados</option>
                  </select>
                </div>
                <div class="campo" style="margin:0">
                  <label style="font-size:11px">Qtd. Mínima</label>
                  <input type="number" id="nota-min-${idx}" value="1" min="0" step="0.1" style="font-size:13px;padding:8px">
                </div>
              </div>
            </div>
          </div>` : ''}
      </div>`;
  });

  html += `
    <div style="margin-top:16px;margin-bottom:32px">
      <div class="campo">
        <label for="nota-data">Data da Feira</label>
        <input type="date" id="nota-data" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <button class="btn btn-primario" onclick="confirmarNota()">Confirmar e Salvar Feira</button>
    </div>`;

  el.innerHTML = html;
}

async function confirmarNota() {
  const data = document.getElementById('nota-data')?.value || new Date().toISOString().split('T')[0];
  const produtosEnviar = _produtosNota.map((p, idx) => {
    const item = { nome: p.nome, quantidade: p.quantidade, preco_unitario: p.preco_unitario };
    if (p.produto_existente) {
      item.produto_id = p.produto_existente.id;
    } else {
      const checkEl = document.getElementById(`cadastrar-${idx}`);
      item.cadastrar = checkEl ? checkEl.checked : false;
      if (item.cadastrar) {
        item.categoria = document.getElementById(`nota-cat-${idx}`)?.value || 'Geral';
        item.quantidade_minima = parseFloat(document.getElementById(`nota-min-${idx}`)?.value) || 1;
      }
    }
    return item;
  });

  try {
    await api('/api/nota/confirmar', { method: 'POST', body: { produtos: produtosEnviar, data } });
    toast('Feira registrada com sucesso!', 'sucesso');
    document.getElementById('feira-etapa-2').style.display = 'none';
    document.getElementById('feira-etapa-1').style.display = 'block';
    document.getElementById('url-nota').value = '';
    irPara('pg-historico');
  } catch (e) {
    toast('Erro ao confirmar feira: ' + e.message, 'erro');
  }
}

function mostrarRegistroManual() {
  document.getElementById('feira-etapa-1').style.display = 'none';
  document.getElementById('feira-etapa-2').style.display = 'none';
  const manual = document.getElementById('feira-manual');
  manual.style.display = 'block';
  document.getElementById('feira-manual-data').value = new Date().toISOString().split('T')[0];
}

async function confirmarFeiraManual() {
  const data = document.getElementById('feira-manual-data').value;
  const valor = parseFloat(document.getElementById('feira-manual-valor').value) || 0;
  if (!data) { toast('Informe a data', 'erro'); return; }
  try {
    await api('/api/feiras/registrar', { method: 'POST', body: { data, valor_total: valor, itens: [] } });
    toast('Feira registrada!', 'sucesso');
    document.getElementById('feira-manual').style.display = 'none';
    document.getElementById('feira-etapa-1').style.display = 'block';
    irPara('pg-historico');
  } catch (e) {
    toast('Erro ao registrar feira', 'erro');
  }
}
