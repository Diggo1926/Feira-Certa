async function carregarHistorico() {
  const el = document.getElementById('lista-historico');
  el.innerHTML = loading();
  try {
    const feiras = await api('/api/feiras');
    renderizarHistorico(feiras);
    if (feiras.length >= 2) {
      const labels = [...feiras].reverse().map(f => formatarData(f.data).slice(0, 5));
      const valores = [...feiras].reverse().map(f => f.valor_total);
      setTimeout(() => desenharGrafico('canvas-historico', labels, valores, '#C9956E'), 100);
    } else {
      const canvas = document.getElementById('canvas-historico');
      if (canvas) {
        canvas.height = 0;
        canvas.parentElement.style.display = 'none';
      }
    }
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><p>Erro ao carregar histórico.</p></div>`;
  }
}

function renderizarHistorico(feiras) {
  const el = document.getElementById('lista-historico');
  if (!feiras.length) {
    el.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      <p>Nenhuma feira registrada ainda.</p>
    </div>`;
    return;
  }

  el.innerHTML = feiras.map(f => {
    const varHtml = f.variacao !== null
      ? `<span class="${f.variacao > 0 ? 'variacao-pos' : 'variacao-neg'}">
           ${f.variacao > 0 ? '↑' : '↓'} ${Math.abs(f.variacao)}%
         </span>`
      : '';

    return `
      <div class="feira-item">
        <div class="feira-header" onclick="toggleDetalhesFeira(${f.id}, this)">
          <div>
            <div class="feira-data">${formatarData(f.data)}</div>
            <div style="font-size:12px;color:var(--texto-sec)">${varHtml}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="feira-valor">${formatarMoeda(f.valor_total)}</div>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--texto-sec)" stroke-width="2" width="16" height="16"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>
        <div class="feira-detalhes" id="detalhes-feira-${f.id}">
          <div class="loading" style="padding:12px"><div class="spinner"></div></div>
        </div>
      </div>`;
  }).join('');
}

async function toggleDetalhesFeira(id, headerEl) {
  const detEl = document.getElementById(`detalhes-feira-${id}`);
  const aberto = detEl.classList.contains('aberto');

  if (aberto) {
    detEl.classList.remove('aberto');
    return;
  }

  detEl.classList.add('aberto');

  if (detEl.dataset.carregado) return;
  detEl.dataset.carregado = '1';

  try {
    const feira = await api(`/api/feiras/${id}`);
    if (!feira.itens.length) {
      detEl.innerHTML = `<p style="color:var(--texto-sec);font-size:13px;padding:8px 0">Sem itens registrados nesta feira.</p>`;
      return;
    }
    detEl.innerHTML = feira.itens.map(i => `
      <div class="feira-detalhe-item">
        <span>${i.nome_produto}</span>
        <span style="color:var(--texto-sec)">${i.quantidade} × ${formatarMoeda(i.preco_unitario)}</span>
        <span style="font-weight:700;color:var(--musgo)">${formatarMoeda(i.quantidade * i.preco_unitario)}</span>
      </div>`).join('');
  } catch (e) {
    detEl.innerHTML = `<p style="color:var(--erro);font-size:13px;padding:8px 0">Erro ao carregar itens.</p>`;
  }
}
