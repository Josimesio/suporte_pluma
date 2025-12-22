let dadosBrutos = [];
let chartServico, chartSeveridade, chartData, chartIssueType;
let masterIssueTypes = [];

Chart.register(ChartDataLabels);

// ===============================
// Utils
// ===============================
function pad2(n){ return String(n).padStart(2,"0"); }

function formatBR(dt){
  if (!dt || isNaN(dt)) return "";
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth()+1)}/${dt.getFullYear()}, ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

function safeText(v){ return (v ?? "").toString().trim(); }

// ===============================
// CSV
// ===============================
function parseCSV(texto) {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== "");
  if (!linhas.length) return [];

  const cabecalho = linhas[0].split(",").map(h => h.trim());
  if (cabecalho[0]) cabecalho[0] = cabecalho[0].replace(/^\uFEFF/, "");

  const dados = [];
  for (let i = 1; i < linhas.length; i++) {
    const cols = linhas[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const obj = {};
    for (let j = 0; j < cabecalho.length; j++) {
      const key = cabecalho[j];
      obj[key] = (cols[j] || "").replace(/^"|"$/g, "").trim();
    }
    dados.push(obj);
  }
  return dados;
}

// ===============================
// Datas (inclui Today/Yesterday)
// ===============================
function parseDataFlex(valor) {
  if (!valor) return null;
  let s = String(valor).trim().replace(/^"|"$/g, "").trim();
  if (!s) return null;

  // Today 1:55 PM / Yesterday 8:56 AM
  const mToday = s.match(/^Today\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (mToday) {
    const now = new Date();
    let hh = parseInt(mToday[1],10);
    const mm = parseInt(mToday[2],10);
    const ap = mToday[3].toUpperCase();
    if (ap === "PM" && hh < 12) hh += 12;
    if (ap === "AM" && hh === 12) hh = 0;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
  }

  const mY = s.match(/^Yesterday\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (mY) {
    const now = new Date();
    let hh = parseInt(mY[1],10);
    const mm = parseInt(mY[2],10);
    const ap = mY[3].toUpperCase();
    if (ap === "PM" && hh < 12) hh += 12;
    if (ap === "AM" && hh === 12) hh = 0;
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate()-1, hh, mm, 0);
    return y;
  }

  // Nov 19, 2025 / Dec 1, 2025
  const d1 = new Date(s);
  if (!isNaN(d1)) return d1;

  // dd/mm/yyyy
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    let dia = parseInt(m[1], 10);
    let mes = parseInt(m[2], 10) - 1;
    let ano = parseInt(m[3], 10);
    if (ano < 100) ano += 2000;
    let hh = parseInt(m[4] || "0", 10);
    let mm = parseInt(m[5] || "0", 10);
    let ss = parseInt(m[6] || "0", 10);
    const d = new Date(ano, mes, dia, hh, mm, ss);
    if (!isNaN(d)) return d;
  }

  return null;
}

// ===============================
// Contagens
// ===============================
function contarPorCampo(lista, campo) {
  const mapa = {};
  lista.forEach(item => {
    const valor = safeText(item[campo]) || "Não informado";
    mapa[valor] = (mapa[valor] || 0) + 1;
  });
  return mapa;
}

function valoresUnicos(lista, campo) {
  return Array.from(new Set(lista.map(i => safeText(i[campo])).filter(v => v))).sort();
}

// ===============================
// UI: Atualizado em
// ===============================
function atualizarTextoAtualizadoEm() {
  const el = document.getElementById("txtAtualizadoEm");
  if (!el) return;

  // Preferência: coluna "Gerado em" (se existir)
  let melhor = null;

  for (const d of dadosBrutos) {
    const g = d["Gerado em"] || d["Gerado_em"] || d["GeradoEm"] || "";
    const dg = parseDataFlex(g);
    if (dg && (!melhor || dg > melhor)) melhor = dg;
  }

  // fallback: maior Atualizado_dt
  if (!melhor) {
    for (const d of dadosBrutos) {
      const du = parseDataFlex(d["Atualizado_dt"]);
      if (du && (!melhor || du > melhor)) melhor = du;
    }
  }

  // fallback final: se nada parseou, mostra texto padrão
  if (melhor) el.textContent = `⏱ Atualizado em: ${formatBR(melhor)} (BRT)`;
  else el.textContent = `⏱ Atualizado em: (não identificado no CSV)`;
}

// ===============================
// Filtros + Busca
// ===============================
function filtrarDados() {
  const servico = document.getElementById("filtroServico")?.value || "";
  const status = document.getElementById("filtroStatus")?.value || "";
  const severidade = document.getElementById("filtroSeveridade")?.value || "";

  return dadosBrutos.filter(item => {
    if (servico && item["Serviço"] !== servico) return false;
    if (status && item["Status"] !== status) return false;
    if (severidade && item["Severidade"] !== severidade) return false;
    return true;
  });
}

function aplicarBusca(dados) {
  const campoBusca = document.getElementById("buscaTabela");
  if (!campoBusca) return dados;

  const termo = campoBusca.value.trim().toLowerCase();
  if (!termo) return dados;

  return dados.filter(d => {
    return [
      d["Número SR"], d["Serviço"], d["Issue Type"], d["Status"], d["Severidade"],
      d["Criado_dt"], d["Atualizado_dt"], d["Contato Primário"]
    ].some(c => (c || "").toLowerCase().includes(termo));
  });
}

// ===============================
// KPIs
// ===============================
function atualizarKPIs(dados) {
  const totalEl = document.getElementById("kpiTotal");
  const abertosEl = document.getElementById("kpiAbertos");
  const fechadosEl = document.getElementById("kpiFechados");
  const topModuloEl = document.getElementById("kpiTopModulo");
  if (!totalEl || !abertosEl || !fechadosEl || !topModuloEl) return;

  const total = dados.length;
  const fechados = dados.filter(d => {
    const st = (d["Status"] || "").toLowerCase();
    return st.includes("closed") || st.includes("close requested") || st.includes("resolved");
  }).length;

  totalEl.innerText = total;
  abertosEl.innerText = total - fechados;
  fechadosEl.innerText = fechados;

  const porServico = contarPorCampo(dados, "Serviço");
  let top = "-"; let max = 0;
  for (const [k,v] of Object.entries(porServico)) {
    if (v > max) { max = v; top = k; }
  }
  topModuloEl.innerText = top;
}

// ===============================
// Charts config base
// ===============================
function chartAnimOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 800, easing: "easeOutQuart" },
    ...extra
  };
}

// ===============================
// SRs por Serviço
// ===============================
function atualizarGraficoPorServico(dados) {
  const canvas = document.getElementById("graficoPorServico");
  if (!canvas) return;

  const contagem = contarPorCampo(dados, "Serviço");
  const labels = Object.keys(contagem);
  const valores = Object.values(contagem);

  if (chartServico) chartServico.destroy();

  chartServico = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ data: valores, backgroundColor: "#006E51", borderRadius: 4 }] },
    options: chartAnimOptions({
      plugins: {
        legend: { display: false },
        datalabels: { color: "#000", anchor: "end", align: "top", font: { weight: "bold", size: 10 }, formatter: v => v }
      },
      scales: { y: { beginAtZero: true, precision: 0 } }
    })
  });
}

// ===============================
// SRs por Severidade
// ===============================
function atualizarGraficoPorSeveridade(dados) {
  const canvas = document.getElementById("graficoPorSeveridade");
  if (!canvas) return;

  const contagem = contarPorCampo(dados, "Severidade");
  const labels = Object.keys(contagem);
  const valores = Object.values(contagem);

  if (chartSeveridade) chartSeveridade.destroy();

  chartSeveridade = new Chart(canvas, {
    type: "pie",
    data: { labels, datasets: [{ data: valores, backgroundColor: ["#006E51","#F2C700","#003F35","#77C29B","#AAAAAA"] }] },
    options: chartAnimOptions({
      plugins: {
        legend: { position: "right" },
        datalabels: { color: "#000", font: { weight: "bold", size: 10 }, formatter: v => v }
      }
    })
  });
}

// ===============================
// SRs criados por mês + painel (inclui meses zerados + S/ DATA)
// ===============================
function atualizarGraficoPorData(dados) {
  const canvas = document.getElementById("graficoPorData");
  if (!canvas) return;

  const labels = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ","S/ DATA"];
  const mapa = Array(13).fill(0);

  const pegarCriado = (d) => d["Criado_dt"] || d["Created Date"] || d["Created"] || d["Creation Date"] || "";

  dados.forEach(d => {
    const dtStr = pegarCriado(d);
    const dt = parseDataFlex(dtStr);
    if (!dt) { mapa[12] += 1; return; }
    if (dt.getFullYear() !== 2025) return;
    const idx = dt.getMonth(); // 0..11
    if (idx >= 0 && idx <= 11) mapa[idx] += 1;
  });

  const total = mapa.reduce((a,b)=>a+b,0);

  // Painel meses (se existir)
  const tbody = document.getElementById("painelMesesPct");
  const resumo = document.getElementById("painelMesesResumo");
  if (tbody) {
    const ranking = labels.map((m, idx) => {
      const qtd = mapa[idx];
      const pct = total > 0 ? (qtd/total)*100 : 0;
      return { m, qtd, pct, idx };
    }).sort((a,b)=> (b.qtd!==a.qtd) ? b.qtd-a.qtd : a.idx-b.idx);

    tbody.innerHTML = "";
    ranking.forEach((r,i)=>{
      const tr = document.createElement("tr");
      if (i===0 && r.qtd>0) tr.classList.add("table-warning");
      tr.innerHTML = `<td>${r.m}</td><td class="text-end">${r.qtd}</td><td class="text-end">${r.pct.toFixed(1)}%</td>`;
      tbody.appendChild(tr);
    });

    if (resumo) {
      const top = ranking[0];
      resumo.textContent = `Total (incl. S/ DATA): ${total} • Pico: ${top.m} (${top.qtd}) • S/ DATA: ${mapa[12]}`;
    }
  }

  if (chartData) chartData.destroy();

  chartData = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ label: "SRs por mês (2025)", data: mapa, backgroundColor: "#003F35", borderRadius: 4 }] },
    options: chartAnimOptions({
      plugins: {
        legend: { display: false },
        subtitle: { display: true, text: `Total (incl. S/ DATA): ${total} SRs`, padding: { top: 2, bottom: 10 } },
        datalabels: {
          display: (ctx) => (ctx.dataset.data[ctx.dataIndex] || 0) > 0,
          formatter: v => v,
          color: "#000",
          anchor: "end",
          align: "top",
          offset: 2,
          clamp: true,
          clip: false,
          font: { weight: "bold", size: 11 }
        }
      },
      scales: { y: { beginAtZero: true, precision: 0 } }
    })
  });
}

// ===============================
// SRs por Tipo de Ocorrência + painel (inclui zeros)
// ===============================
function atualizarGraficoPorIssueType(dados) {
  const canvas = document.getElementById("graficoPorIssueType");
  if (!canvas) return;

  const contagem = contarPorCampo(dados, "Issue Type");
  const tipos = (masterIssueTypes && masterIssueTypes.length) ? masterIssueTypes : Object.keys(contagem);
  const valores = tipos.map(t => contagem[t] || 0);
  const total = valores.reduce((a,b)=>a+b,0);

  // Painel issue (se existir)
  const tbody = document.getElementById("painelIssuePct");
  const resumo = document.getElementById("painelIssueResumo");
  if (tbody) {
    const ranking = tipos.map((t,idx)=>{
      const qtd = valores[idx];
      const pct = total>0 ? (qtd/total)*100 : 0;
      return { t, qtd, pct };
    }).sort((a,b)=> (b.qtd!==a.qtd) ? b.qtd-a.qtd : a.t.localeCompare(b.t));

    tbody.innerHTML = "";
    ranking.forEach((r,i)=>{
      const tr = document.createElement("tr");
      if (i===0 && r.qtd>0) tr.classList.add("table-warning");
      tr.innerHTML = `<td>${r.t}</td><td class="text-end">${r.qtd}</td><td class="text-end">${r.pct.toFixed(1)}%</td>`;
      tbody.appendChild(tr);
    });

    if (resumo) {
      const top = ranking[0];
      resumo.textContent = total>0 ? `Total no filtro: ${total} SRs • Top: ${top.t} (${top.qtd})` : "Total no filtro: 0 SRs";
    }
  }

  if (chartIssueType) chartIssueType.destroy();

  chartIssueType = new Chart(canvas, {
    type: "bar",
    data: { labels: tipos, datasets: [{ data: valores, backgroundColor: "#F2C700", borderRadius: 4 }] },
    options: chartAnimOptions({
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        subtitle: { display: true, text: `Total no filtro: ${total} SRs`, padding: { top: 2, bottom: 10 } },
        datalabels: {
          display: (ctx) => (ctx.dataset.data[ctx.dataIndex] || 0) > 0,
          color: "#000",
          align: "right",
          anchor: "end",
          font: { weight: "bold", size: 10 },
          formatter: v => v
        }
      },
      scales: { x: { beginAtZero: true, precision: 0 } }
    })
  });
}

// ===============================
// Tabela (index.html)
// ===============================
function atualizarTabela(dados) {
  const tb = document.getElementById("tabelaSRs");
  if (!tb) return;

  tb.innerHTML = "";
  dados.forEach(d => {
    const tr = document.createElement("tr");
    ["Número SR","Serviço","Issue Type","Status","Severidade","Criado_dt","Atualizado_dt","Contato Primário"].forEach(c => {
      const td = document.createElement("td");
      td.textContent = d[c] || "";
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
}

// ===============================
// Modo TV
// ===============================
function toggleTvMode() {
  const btn = document.getElementById("btnTvMode");
  const emTelaCheia = !!document.fullscreenElement;

  if (!emTelaCheia) {
    document.documentElement.requestFullscreen?.().catch(() => {});
    document.body.classList.add("tv-mode");
    if (btn) btn.textContent = "⏹ Sair Modo TV";
  } else {
    document.exitFullscreen?.();
    document.body.classList.remove("tv-mode");
    if (btn) btn.textContent = "🎬 Modo TV";
  }
}

document.addEventListener("fullscreenchange", () => {
  const btn = document.getElementById("btnTvMode");
  if (!btn) return;
  if (!document.fullscreenElement) {
    document.body.classList.remove("tv-mode");
    btn.textContent = "🎬 Modo TV";
  } else {
    document.body.classList.add("tv-mode");
    btn.textContent = "⏹ Sair Modo TV";
  }
});

// ===============================
// Atualização geral
// ===============================
function atualizarDashboard() {
  let filtrados = filtrarDados();
  filtrados = aplicarBusca(filtrados);

  atualizarKPIs(filtrados);
  atualizarGraficoPorData(filtrados);
  atualizarGraficoPorIssueType(filtrados);
  atualizarGraficoPorServico(filtrados);
  atualizarGraficoPorSeveridade(filtrados);
  atualizarTabela(filtrados);
}

// ===============================
// Filtros init
// ===============================
function preencherFiltros() {
  const servicos = valoresUnicos(dadosBrutos, "Serviço");
  const status = valoresUnicos(dadosBrutos, "Status");
  const severidades = valoresUnicos(dadosBrutos, "Severidade");

  const selServico = document.getElementById("filtroServico");
  const selStatus = document.getElementById("filtroStatus");
  const selSeveridade = document.getElementById("filtroSeveridade");

  if (selServico) servicos.forEach(v => selServico.innerHTML += `<option value="${v}">${v}</option>`);
  if (selStatus) status.forEach(v => selStatus.innerHTML += `<option value="${v}">${v}</option>`);
  if (selSeveridade) severidades.forEach(v => selSeveridade.innerHTML += `<option value="${v}">${v}</option>`);
}

// ===============================
// Load
// ===============================
async function carregarDados() {
  const resp = await fetch("dados_sr.csv");
  const texto = await resp.text();

  dadosBrutos = parseCSV(texto);
  masterIssueTypes = valoresUnicos(dadosBrutos, "Issue Type");
  if (!masterIssueTypes.length) masterIssueTypes = ["Não informado"];

  preencherFiltros();
  atualizarTextoAtualizadoEm();
  atualizarDashboard();

  document.getElementById("filtroServico")?.addEventListener("change", atualizarDashboard);
  document.getElementById("filtroStatus")?.addEventListener("change", atualizarDashboard);
  document.getElementById("filtroSeveridade")?.addEventListener("change", atualizarDashboard);
  document.getElementById("buscaTabela")?.addEventListener("input", atualizarDashboard);
  document.getElementById("btnTvMode")?.addEventListener("click", toggleTvMode);
}

carregarDados();
