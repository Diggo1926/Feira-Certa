let _scannerNota = null;

function _mostrarErroCamara(msg) {
  const existente = document.getElementById('erro-camera');
  if (existente) existente.remove();
  const div = document.createElement('div');
  div.id = 'erro-camera';
  div.style.cssText = 'color:#c0392b;font-size:13px;margin:8px 0;padding:10px;background:#fdf0f0;border-radius:8px;border:1px solid #e74c3c;text-align:center';
  div.textContent = msg;
  document.getElementById('scanner-nota')?.insertAdjacentElement('afterend', div);
  toast(msg, 'erro');
}

async function iniciarScannerNota() {
  const div = document.getElementById('scanner-nota');
  if (!div) { toast('Elemento do scanner não encontrado', 'erro'); return; }

  if (typeof Html5Qrcode === 'undefined') {
    _mostrarErroCamara('Biblioteca QR Code não carregou. Verifique a conexão com a internet.');
    return;
  }

  if (_scannerNota) {
    try { await _scannerNota.stop(); } catch (_) {}
    _scannerNota = null;
  }

  document.getElementById('erro-camera')?.remove();
  div.innerHTML = '';
  div.style.display = 'block';

  try {
    _scannerNota = new Html5Qrcode('scanner-nota');
    await _scannerNota.start(
      { facingMode: 'environment' },
      {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
      },
      (decoded) => {
        pararScannerNota();
        processarURLDecodificada(decoded);
      },
      () => {}
    );
  } catch (err) {
    div.style.display = 'none';
    _scannerNota = null;
    _mostrarErroCamara('Câmera indisponível: ' + (err?.message || String(err)));
  }
}

async function pararScannerNota() {
  if (_scannerNota) {
    try { await _scannerNota.stop(); } catch (_) {}
    _scannerNota = null;
    const div = document.getElementById('scanner-nota');
    if (div) { div.innerHTML = ''; div.style.display = 'none'; }
  }
}

function processarURLDecodificada(url) {
  window.open(url, '_blank');
  mostrarFormRapido();
}

function processarURLNota() {
  const url = document.getElementById('url-nota').value.trim();
  if (!url) { toast('Cole ou leia a URL da nota fiscal', 'erro'); return; }
  window.open(url, '_blank');
  mostrarFormRapido();
}

function processarChaveAcesso() {
  const chave = document.getElementById('chave-nota').value.trim().replace(/\D/g, '');
  if (chave.length !== 44) { toast('A chave de acesso deve ter exatamente 44 dígitos', 'erro'); return; }
  window.open(`http://www.nfce.se.gov.br/nfce/consulta?chNFe=${chave}`, '_blank');
  mostrarFormRapido();
}

function mostrarFormRapido() {
  document.getElementById('feira-etapa-1').style.display = 'none';
  const etapa2 = document.getElementById('feira-etapa-2');
  etapa2.style.display = 'block';
  etapa2.innerHTML = `
    <div class="tela-header" style="margin-bottom:8px">
      <div class="tela-titulo">Registrar Feira</div>
      <button class="btn btn-secundario btn-sm" onclick="voltarEtapa1()">Voltar</button>
    </div>
    <div class="card" style="background:#edf7ed;border:1px solid #81c784;margin-bottom:16px;padding:14px">
      <div style="font-weight:600;margin-bottom:4px;color:#2e7d32">Nota aberta em nova aba</div>
      <div style="font-size:13px;color:#555">Confira os produtos e o total na nota, depois preencha abaixo.</div>
    </div>
    <div class="campo">
      <label for="nota-data-rapida">Data da Feira</label>
      <input type="date" id="nota-data-rapida" value="${new Date().toISOString().split('T')[0]}">
    </div>
    <div class="campo">
      <label for="nota-valor-rapido">Valor Total (R$)</label>
      <input type="number" id="nota-valor-rapido" placeholder="0,00" step="0.01" min="0" inputmode="decimal">
    </div>
    <button class="btn btn-primario" style="width:100%;margin-top:4px" onclick="confirmarFeiraRapida()">Confirmar Feira</button>
    <div class="divider"></div>
    <button class="btn btn-secundario" style="width:100%" onclick="mostrarRegistroManual()">Adicionar Produtos ao Estoque</button>
  `;
}

async function confirmarFeiraRapida() {
  const data = document.getElementById('nota-data-rapida')?.value || new Date().toISOString().split('T')[0];
  const valor = parseFloat(document.getElementById('nota-valor-rapido')?.value) || 0;
  try {
    await api('/api/feiras/registrar', { method: 'POST', body: { data, valor_total: valor, itens: [] } });
    toast('Feira registrada!', 'sucesso');
    voltarEtapa1();
    irPara('pg-historico');
  } catch (e) {
    toast('Erro ao registrar feira: ' + e.message, 'erro');
  }
}

function voltarEtapa1() {
  document.getElementById('feira-etapa-1').style.display = 'block';
  document.getElementById('feira-etapa-2').style.display = 'none';
  document.getElementById('feira-etapa-2').innerHTML = '';
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
