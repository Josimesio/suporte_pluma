let dadosBrutos = [];
let chartServico, chartSeveridade, chartData, chartIssueType;

// ===============================
// REGISTRO DO PLUGIN DE RÓTULOS
// ===============================
if (window.Chart && window.ChartDataLabels) {
  Chart.register(ChartDataLabels);
}

// ===============================
// ANIMAÇÃO VISUAL DE ATUALIZAÇÃO
// ===============================
function animarAtualizacao() {
  const kpiCards = document.querySelectorAll(".kpi-card");
  const graficoCards = document.querySelectorAll(".grafico-card");
  const tabelaCard = document.querySelector(".tabela-card");

  [...kpiCards, ...graficoCards, tabelaCard].forEach(el => {
    if (!el) return;
    el.classList.remove("animate-update");
    void el.offsetWidth; // reflow
    el.classList.add("animate-update");
  });
}

// ===============================
// MODO TV / TELA CHEIA
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
// FUNÇÕES UTILITÁRIAS
// ===============================
function contarPorCampo(lista, campo) {
  const mapa = {};
  lista.forEach(item => {
    const valor = item[campo] || "Não informado";
    mapa[valor] = (mapa[valor] || 0) + 1;
  });
  return mapa;
}

function valoresUnicos(lista, campo) {
  return Array.from(new Set(
    lista.map(item => item[campo]).filter(v => v && v.trim() !== "")
  )).sort();
}

// CSV simples (suporta vírgulas dentro de aspas)
function parseCSV(texto) {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== "");
  if (!linhas.length) return [];

  const cabecalho = linhas[0].split(",").map(h => h.trim());

  // ✅ remove BOM invisível do primeiro header
  if (cabecalho[0]) cabecalho[0] = cabecalho[0].replace(/^\uFEFF/, "");

  const dados = [];

  for (let i = 1; i < linhas.length; i++) {
    const cols = linhas[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const obj = {};

    for (let j = 0; j < cabecalho.length; j++) {
      const key = cabecalho[j];
      obj[key] = (cols[j] || "").replace(/^"|"$/g, "").trim();
    }

    // só adiciona se tiver algum valor (evita lixo no final)
    const temValor = Object.values(obj).some(v => v && String(v).trim() !== "");
    if (temValor) dados.push(obj);
  }

  return dados;
}

// ===============================
// ✅ PARSE DE DATA “À PROVA DE ORACLE”
// ===============================
function parseDataFlex(valor) {
  if (!valor) return null;

  let s = String(valor).trim();
  if (!s) return null;

  // remove aspas
  s = s.replace(/^"|"$/g, "").trim();

  // limpa sufixos comuns (UTC, GMT, etc.)
  s = s.replace(/\s+(UTC|GMT).*$/i, "").trim();

  // remove milissegundos tipo .000
  s = s.replace(/\.\d{3,}/g, "").trim();

  // tenta padronizar "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SS"
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    s = s.replace(" ", "T");
  }

  // 1) tenta parse nativo (bom pra ISO)
  let d = new Date(s);
  if (!isNaN(d)) return d;

  // 2) dd/mm/yyyy ou dd-mm-yyyy (com ou sem hora)
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    let dia = parseInt(m[1], 10);
    let mes = parseInt(m[2], 10) - 1;
    let ano = parseInt(m[3], 10);
    if (ano < 100) ano += 2000;
    let hh = parseInt(m[4] || "0", 10);
    let mm = parseInt(m[5] || "0", 10);
    let ss = parseInt(m[6] || "0", 10);
    d = new Date(ano, mes, dia, hh, mm, ss);
    if (!isNaN(d)) return d;
  }

  // 3) yyyy/mm/dd ou yyyy-mm-dd (com ou sem hora)
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    let ano = parseInt(m[1], 10);
    let mes = parseInt(m[2], 10) - 1;
    let dia = parseInt(m[3], 10);
    let hh = parseInt(m[4] || "0", 10);
    let mm = parseInt(m[5] || "0", 10);
    let ss = parseInt(m[6] || "0", 10);
    d = new Date(ano, mes, dia, hh, mm, ss);
    if (!isNaN(d)) return d;
  }

  // 4) dd-MMM-yyyy (ex: 17-DEC-2025 / 17-dez-2025)
  const meses = {
    jan: 0, fev: 1, feb: 1, mar: 2, abr: 3, apr: 3, mai: 4, may: 4,
    jun: 5, jul: 6, ago: 7, aug: 7, set: 8, sep: 8, out: 9, oct: 9,
    nov: 10, dez: 11, dec: 11
  };

  m = s.match(/^(\d{1,2})[\-\s\/]([A-Za-zÀ-ÿ]{3,})[\-\s\/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    let dia = parseInt(m[1], 10);
    let mesTxt = m[2].toLowerCase().slice(0, 3);
    let mes = meses[mesTxt];
    let ano = parseInt(m[3], 10);
    let hh = parseInt(m[4] || "0", 10);
    let mm = parseInt(m[5] || "0", 10);
    let ss = parseInt(m[6] || "0", 10);

    if (mes !== undefined) {
      d = new Date(ano, mes, dia, hh, mm, ss);
      if (!isNaN(d)) return d;
    }
  }

  return null;
}

// ===============================
// ✅ FORMATAÇÃO pt-BR (dd/mm/yyyy, HH:MM)
// ===============================
function formatarDataBR(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}, ${hh}:${mi}`;
}

// ===============================
// ✅ HEADER: "Atualizado em" vindo do CSV pela coluna "Gerado em"
// ===============================
function atualizarHeaderAtualizadoEmPorGeradoEm(lista) {
  const el = document.getElementById("txtAtualizadoEm");
  if (!el) return;

  // suporta pequenas variações de nome (caso alguém mude no Excel)
  const chaves = ["Gerado em", "Gerado_em", "GeradoEm", "Gerado_em_dt", "Gerado_dt"];

  let maxDate = null;

  for (const item of (lista || [])) {
    let raw = "";
    for (const k of chaves) {
      if (item[k]) { raw = item[k]; break; }
    }
    const dt = parseDataFlex(raw);
    if (!dt) continue;
    if (!maxDate || dt > maxDate) maxDate = dt;
  }

  el.textContent = maxDate
    ? `⏱ Atualizado em: ${formatarDataBR(maxDate)} (BRT)`
    : "⏱ Atualizado em: ... (BRT)";
}

// ===============================
// FILTROS E BUSCA
// ===============================
function filtrarDados() {
  const servicoEl = document.getElementById("filtroServico");
  const statusEl = document.getElementById("filtroStatus");
  const severidadeEl = document.getElementById("filtroSeveridade");

  const servico = servicoEl ? servicoEl.value : "";
  const status = statusEl ? statusEl.value : "";
  const severidade = severidadeEl ? severidadeEl.value : "";

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
      d["Número SR"],
      d["Serviço"],
      d["Issue Type"],
      d["Status"],
      d["Contato Primário"],
      d["Gerado em"] // opcional: ajuda a buscar por lote/data
    ].some(campo => (campo || "").toLowerCase().includes(termo));
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
  let topModulo = "-";
  let max = 0;

  for (const [serv, qtd] of Object.entries(porServico)) {
    if (qtd > max) {
      max = qtd;
      topModulo = serv;
    }
  }
  topModuloEl.innerText = topModulo;
}

// ===============================
// OPÇÕES DE GRÁFICOS
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
// GRÁFICO: SRs por Serviço (BARRAS)
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
    data: {
      labels,
      datasets: [{
        data: valores,
        backgroundColor: "#006E51",
        borderRadius: 4
      }]
    },
    options: chartAnimOptions({
      plugins: {
        legend: { display: false },
        datalabels: {
          color: "#000",
          anchor: "end",
          align: "top",
          font: { weight: "bold", size: 10 }
        }
      },
      scales: {
        x: { ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 } },
        y: { beginAtZero: true, precision: 0 }
      }
    })
  });
}

// ===============================
// GRÁFICO: SRs por Severidade (PIZZA)
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
    data: {
      labels,
      datasets: [{
        data: valores,
        backgroundColor: ["#006E51", "#F2C700", "#003F35", "#77C29B", "#AAAAAA"]
      }]
    },
    options: chartAnimOptions({
      plugins: {
        legend: { position: "right" },
        datalabels: {
          color: "#000",
          formatter: (v) => v,
          font: { weight: "bold", size: 10 }
        }
      }
    })
  });
}

// ===============================
// GRÁFICO: SRs por Data de Criação (POR MÊS)
// ===============================
function atualizarGraficoPorData(dados) {
  const canvas = document.getElementById("graficoPorData");
  if (!canvas) return;

  // labels fixas do ano 2025 (com zero nos meses sem SR)
  const labels = [];
  const mapa = {};
  for (let m = 1; m <= 12; m++) {
    const chave = `2025-${String(m).padStart(2, "0")}`;
    labels.push(chave);
    mapa[chave] = 0;
  }

  // tenta pegar a data por chaves alternativas também (caso teu CSV mude)
  const pegarCriado = (d) =>
    d["Criado_dt"] ||
    d["Created Date"] ||
    d["Created"] ||
    d["Creation Date"] ||
    "";

  dados.forEach(d => {
    const dtStr = pegarCriado(d);
    const data = parseDataFlex(dtStr);
    if (!data) return;

    const ano = data.getFullYear();
    if (ano !== 2025) return;

    const chave = `${ano}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    if (mapa[chave] !== undefined) mapa[chave] += 1;
  });

  const valores = labels.map(l => mapa[l]);

  if (chartData) chartData.destroy();

  chartData = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "SRs por mês (2025)",
        data: valores,
        backgroundColor: "#003F35",
        borderRadius: 4
      }]
    },
    options: chartAnimOptions({
      plugins: {
        legend: { display: false },
        datalabels: {
          color: "#000",
          anchor: "end",
          align: "top",
          font: { weight: "bold", size: 10 }
        }
      },
      scales: {
        y: { beginAtZero: true, precision: 0 }
      }
    })
  });
}

// ===============================
// GRÁFICO: SRs por Tipo de Ocorrência (BARRAS HORIZONTAIS)
// ===============================
function atualizarGraficoPorIssueType(dados) {
  const canvas = document.getElementById("graficoPorIssueType");
  if (!canvas) return;

  const contagem = contarPorCampo(dados, "Issue Type");
  const labels = Object.keys(contagem);
  const valores = Object.values(contagem);

  if (chartIssueType) chartIssueType.destroy();

  chartIssueType = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: valores,
        backgroundColor: "#F2C700",
        borderRadius: 4
      }]
    },
    options: chartAnimOptions({
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        datalabels: {
          color: "#000",
          align: "right",
          anchor: "end",
          font: { weight: "bold", size: 10 }
        }
      },
      scales: {
        x: { beginAtZero: true, precision: 0 }
      }
    })
  });
}

// ===============================
// TABELA
// ===============================
function atualizarTabela(dados) {
  const tb = document.getElementById("tabelaSRs");
  if (!tb) return; // página de gráficos não tem tabela

  tb.innerHTML = "";

  dados.forEach(d => {
    const tr = document.createElement("tr");

    [
      "Número SR",
      "Serviço",
      "Issue Type",
      "Status",
      "Severidade",
      "Criado_dt",
      "Atualizado_dt",
      "Contato Primário"
    ].forEach(campo => {
      const td = document.createElement("td");
      td.textContent = d[campo] || "";
      tr.appendChild(td);
    });

    tb.appendChild(tr);
  });
}

// ===============================
// ATUALIZAÇÃO GERAL
// ===============================
function atualizarDashboard() {
  let filtrados = filtrarDados();
  filtrados = aplicarBusca(filtrados);

  atualizarKPIs(filtrados);
  atualizarGraficoPorServico(filtrados);
  atualizarGraficoPorSeveridade(filtrados);
  atualizarGraficoPorData(filtrados);
  atualizarGraficoPorIssueType(filtrados);
  atualizarTabela(filtrados);

  animarAtualizacao();
}

// ===============================
// INICIALIZAÇÃO
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

async function carregarDados() {
  const resp = await fetch("dados_sr.csv", { cache: "no-store" });
  const texto = await resp.text();

  dadosBrutos = parseCSV(texto);

  // ✅ aqui: pega do CSV na coluna "Gerado em" e joga no header
  atualizarHeaderAtualizadoEmPorGeradoEm(dadosBrutos);

  preencherFiltros();
  atualizarDashboard();

  const filtroServico = document.getElementById("filtroServico");
  const filtroStatus = document.getElementById("filtroStatus");
  const filtroSeveridade = document.getElementById("filtroSeveridade");
  const buscaTabela = document.getElementById("buscaTabela");
  const btnTv = document.getElementById("btnTvMode");

  if (filtroServico) filtroServico.addEventListener("change", atualizarDashboard);
  if (filtroStatus) filtroStatus.addEventListener("change", atualizarDashboard);
  if (filtroSeveridade) filtroSeveridade.addEventListener("change", atualizarDashboard);
  if (buscaTabela) buscaTabela.addEventListener("input", atualizarDashboard);
  if (btnTv) btnTv.addEventListener("click", toggleTvMode);
}

carregarDados();
