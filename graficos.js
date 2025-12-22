/* ===============================
   graficos.js – Dashboard Pluma
   =============================== */

(function () {

  // Register do plugin sem quebrar se não existir
  if (window.Chart && window.ChartDataLabels) {
    Chart.register(ChartDataLabels);
  }

  /* 🎨 Paleta Pluma */
  const PLUMA = {
    verdeEscuro: "#003F35",
    verdeMedio:  "#006E51",
    verdeClaro:  "#77C29B",
    amarelo:     "#F2C700",
    cinza:       "#9AA0A6"
  };

  const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];


  // ===== Traduções (Serviço/Status/Severidade) – mantém o padrão do CSV e só "humaniza" a exibição
  const MAP_SERVICO_PT = {
    "Oracle Fusion Cost Management Cloud Service": "Oracle Fusion Gestão de Custos – Serviço em Nuvem",
    "Oracle Integration 3": "Oracle Integration 3 – Integração",
    "Oracle Supply Planning Cloud Service": "Oracle Planejamento de Suprimentos – Serviço em Nuvem",
    "Oracle Fusion Expenses Cloud Service": "Oracle Fusion Despesas – Serviço em Nuvem",
    "Oracle Fusion Purchasing Cloud Service": "Oracle Fusion Compras – Serviço em Nuvem",
    "Oracle Fusion Project Costing Cloud Service": "Oracle Fusion Custos de Projetos – Serviço em Nuvem",
    "Oracle Fusion Inventory Management Cloud Service": "Oracle Fusion Gestão de Estoque – Serviço em Nuvem",
    "Oracle Fusion Performance Management Cloud Service": "Oracle Fusion Gestão de Performance (EPM) – Serviço em Nuvem",
    "Oracle Data Transforms": "Oracle Transformações de Dados (Data Transforms)",
    "Oracle Fusion Product Development Cloud Service": "Oracle Fusion Desenvolvimento de Produto – Serviço em Nuvem",
    "Oracle Enterprise Data Management Cloud Service": "Oracle Gestão de Dados Corporativos (EDM) – Serviço em Nuvem",
    "Oracle Fusion Tax Cloud Service": "Oracle Fusion Fiscal/Impostos – Serviço em Nuvem",
    "OCI Application Performance Monitoring Service": "OCI Monitoramento de Performance de Aplicações (APM)",
    "Oracle Fusion Order Management Cloud Service": "Oracle Fusion Gestão de Pedidos – Serviço em Nuvem",
    "Oracle Fusion Receivables Cloud Service": "Oracle Fusion Contas a Receber – Serviço em Nuvem",
    "Oracle Fusion Self Service Procurement Cloud Service": "Oracle Fusion Compras Self-Service – Serviço em Nuvem",
    "Latin America Cloud Local Solution (LACLS)": "Solução Local América Latina (LACLS)",
    "Oracle Fusion Assets Cloud Service": "Oracle Fusion Ativos (FA) – Serviço em Nuvem",
    "Autonomous Database Serverless": "Banco de Dados Autônomo (Serverless)",
    "Oracle Transportation Management Cloud Service": "Oracle Gestão de Transporte (OTM) – Serviço em Nuvem",
    "Oracle APEX in Cloud": "Oracle APEX na Nuvem",
    "Oracle Cloud Infrastructure - API Gateway": "OCI – API Gateway",
    "Oracle Fusion Global Human Resources Cloud Service": "Oracle Fusion Recursos Humanos Global (HCM) – Serviço em Nuvem",
    "Oracle Fusion Product Hub Cloud Service": "Oracle Fusion Central de Produtos (Product Hub) – Serviço em Nuvem",
    "Oracle Fusion Financials for the Americas": "Oracle Fusion Financeiro para as Américas",
    "Oracle Fusion Financials Common Module Cloud Service": "Oracle Fusion Financeiro – Módulo Comum – Serviço em Nuvem",
    "Oracle Fusion Procurement Contracts Cloud Service": "Oracle Fusion Contratos de Compras – Serviço em Nuvem"
  };

  const MAP_STATUS_PT = {
    "review defect": "Revisão de Defeito",
    "review update": "Revisão de Atualização",
    "customer working": "Cliente em Ação",
    "development working": "Desenvolvimento em Ação",
    "work in progress": "Em Andamento",
    "solution offered": "Solução Oferecida",
    "close requested": "Fechamento Solicitado",
    "closed": "Fechado",
    "resolved": "Resolvido"
  };

  const MAP_SEVERIDADE_PT = {
    "1-critical": "1-Crítica",
    "2-significant": "2-Significativa",
    "3-standard": "3-Padrão"
  };

  function normKey(v) {
    return String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function traduzirValor(valor, mapa) {
    const k = normKey(valor);
    return (k && mapa[k]) ? mapa[k] : valor;
  }

  function traduzirDadosEmMemoria(lista) {
    (lista || []).forEach(r => {
      // preserva original para depuração (não aparece na tela)
      if (r["Serviço"] && !r.__servico_original) r.__servico_original = r["Serviço"];
      if (r["Servico"] && !r.__servico_original) r.__servico_original = r["Servico"];
      if (r["Status"] && !r.__status_original) r.__status_original = r["Status"];
      if (r["Severidade"] && !r.__severidade_original) r.__severidade_original = r["Severidade"];

      // Serviço (com e sem acento)
      if (r["Serviço"]) r["Serviço"] = MAP_SERVICO_PT[r["Serviço"]] || r["Serviço"];
      if (r["Servico"]) r["Servico"] = MAP_SERVICO_PT[r["Servico"]] || r["Servico"];

      // Status / Severidade (case-insensitive)
      if (r["Status"]) r["Status"] = traduzirValor(r["Status"], MAP_STATUS_PT);
      if (r["Severidade"]) r["Severidade"] = traduzirValor(r["Severidade"], MAP_SEVERIDADE_PT);
    });
    return lista;
  }


  /* ===== DOM ===== */
  const el = (id) => document.getElementById(id);

  const filtroServico    = el("filtroServico");
  const filtroStatus     = el("filtroStatus");
  const filtroSeveridade = el("filtroSeveridade");

  const atualizadoEm     = el("atualizadoEm");

  const kpiTotal     = el("kpiTotal");
  const kpiAbertos   = el("kpiAbertos");
  const kpiFechados  = el("kpiFechados");
  const kpiTopModulo = el("kpiTopModulo");

  const canvasCriados = el("graficoPorData");
  const canvasIssue   = el("graficoPorIssueType");
  const canvasAfx     = el("graficoAbertosFechadosMes");
  const canvasServico = el("graficoPorServico");
  const canvasSev     = el("graficoPorSeveridade");

  const tbodyAfx = el("rankingAbertosFechadosMes");

  /* ===== CSV Parser ===== */
  function parseCSV(texto) {
    const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== "");
    if (!linhas.length) return [];

    const cab = linhas[0].split(",").map(h => h.trim().replace(/^\uFEFF/, ""));
    const out = [];

    for (let i = 1; i < linhas.length; i++) {
      const cols = linhas[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      const obj = {};
      for (let j = 0; j < cab.length; j++) {
        obj[cab[j]] = (cols[j] || "").replace(/^"|"$/g, "").trim();
      }
      if (Object.values(obj).some(v => String(v || "").trim() !== "")) out.push(obj);
    }
    return out;
  }

  function valoresUnicos(lista, campo) {
    return Array.from(new Set(lista.map(i => (i[campo] || "").trim()).filter(Boolean))).sort();
  }

  /* ===== Datas ===== */
  function parseDataFlex(valor) {
    if (!valor) return null;
    let s = String(valor).trim();
    if (!s) return null;
    s = s.replace(/^"|"$/g, "").trim();

    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s)) s = s.replace(" ", "T");

    let d = new Date(s);
    if (!isNaN(d)) return d;

    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      let dia = parseInt(m[1], 10);
      let mes = parseInt(m[2], 10) - 1;
      let ano = parseInt(m[3], 10); if (ano < 100) ano += 2000;
      let hh = parseInt(m[4] || "0", 10);
      let mm = parseInt(m[5] || "0", 10);
      let ss = parseInt(m[6] || "0", 10);
      d = new Date(ano, mes, dia, hh, mm, ss);
      if (!isNaN(d)) return d;
    }
    return null;
  }

  function isFechado(status) {
    const s = String(status || "").toLowerCase();
    return (
      s.includes("closed") ||
      s.includes("resolved") ||
      s.includes("close requested") ||
      s.includes("fechado") ||
      s.includes("resolvido") ||
      s.includes("fechamento solicitado")
    );
  }

  function contarPorCampo(lista, campo) {
    const map = {};
    lista.forEach(l => {
      const v = (l[campo] || "Não informado").trim() || "Não informado";
      map[v] = (map[v] || 0) + 1;
    });
    return map;
  }

  /* ===== Config base ===== */
  function baseOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        datalabels: { display: false },
        legend: { labels: { color: PLUMA.verdeEscuro } }
      },
      ...extra
    };
  }

  /* ===== Estado ===== */
  let dados = [];

  let chartCriadosMes = null;
  let chartIssueType = null;
  let chartServico = null;
  let chartSeveridade = null;
  let chartAbertosFechadosMes = null;

  /* ===== 🔹 ADIÇÃO 1: Atualizado em ===== */
 function atualizarAtualizadoEm(dados) {
  if (!atualizadoEm || !dados || !dados.length) {
    if (atualizadoEm) atualizadoEm.textContent = "-";
    return;
  }

  // normaliza strings (remove diferença de espaço, maiúscula, _)
  const normaliza = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/_/g, " ");

  const nomesAceitos = [
    "gerado em",
    "atualizado em",
    "Gerado_em",
    "atualizado_em"
  ].map(normaliza);

  const chaves = Object.keys(dados[0] || {});
  const chaveEncontrada = chaves.find(k =>
    nomesAceitos.includes(normaliza(k))
  );

  let valor = "";

  if (chaveEncontrada) {
    // pega o último valor válido (mais recente)
    for (let i = dados.length - 1; i >= 0; i--) {
      const v = dados[i][chaveEncontrada];
      if (v && String(v).trim()) {
        valor = String(v).trim();
        break;
      }
    }
  }

  atualizadoEm.textContent = valor || "-";
}


  /* ===== Filtros ===== */
  function preencherFiltros() {
    valoresUnicos(dados, "Serviço").forEach(v => filtroServico.insertAdjacentHTML("beforeend", `<option value="${v}">${v}</option>`));
    valoresUnicos(dados, "Status").forEach(v => filtroStatus.insertAdjacentHTML("beforeend", `<option value="${v}">${v}</option>`));
    valoresUnicos(dados, "Severidade").forEach(v => filtroSeveridade.insertAdjacentHTML("beforeend", `<option value="${v}">${v}</option>`));
  }

  function filtrarDados() {
    const serv = filtroServico.value || "";
    const stat = filtroStatus.value || "";
    const sev  = filtroSeveridade.value || "";

    return dados.filter(d => {
      if (serv && d["Serviço"] !== serv) return false;
      if (stat && d["Status"] !== stat) return false;
      if (sev  && d["Severidade"] !== sev) return false;
      return true;
    });
  }

  /* ===== KPIs ===== */
  function atualizarKPIs(lista) {
    const total = lista.length;
    const fech = lista.filter(d => isFechado(d["Status"])).length;

    kpiTotal.textContent = total;
    kpiFechados.textContent = fech;
    kpiAbertos.textContent = total - fech;

    const porServ = contarPorCampo(lista, "Serviço");
    const top = Object.entries(porServ).sort((a,b)=>b[1]-a[1])[0];
    kpiTopModulo.textContent = top ? top[0] : "-";
  }

  /* ===== GRÁFICOS ===== */

  function atualizarGraficoCriadosMes(lista) {
    const contagem = Array(12).fill(0);
    lista.forEach(d => {
      const dt = parseDataFlex(d["Criado_dt"]);
      if (dt) contagem[dt.getMonth()]++;
    });

    chartCriadosMes?.destroy();
    chartCriadosMes = new Chart(canvasCriados, {
      type: "bar",
      data: {
        labels: MESES,
        datasets: [{
          data: contagem,
          backgroundColor: PLUMA.verdeMedio,
          borderRadius: 6
        }]
      },
      options: baseOptions({
        plugins: {
          datalabels: {
            display: true,
            color: PLUMA.verdeEscuro,
            anchor: "end",
            align: "top",
            font: { weight: "bold", size: 10 },
            formatter: v => v > 0 ? v : ""
          },
          legend: { display: false }
        },
        scales: { y: { beginAtZero: true, precision: 0 } }
      })
    });
  }

  function atualizarGraficoAbertosFechados(lista) {
    const abertos  = Array(12).fill(0);
    const fechados = Array(12).fill(0);

    lista.forEach(d => {
      const c = parseDataFlex(d["Criado_dt"]);
      if (c) abertos[c.getMonth()]++;
      if (isFechado(d["Status"])) {
        const u = parseDataFlex(d["Atualizado_dt"]);
        if (u) fechados[u.getMonth()]++;
      }
    });

    chartAbertosFechadosMes?.destroy();
    chartAbertosFechadosMes = new Chart(canvasAfx, {
      type: "bar",
      data: {
        labels: MESES,
        datasets: [
          { label: "Abertos",  data: abertos,  backgroundColor: PLUMA.verdeEscuro, borderRadius: 6 },
          { label: "Fechados", data: fechados, backgroundColor: PLUMA.amarelo,     borderRadius: 6 }
        ]
      },
      options: baseOptions({
        plugins: {
          datalabels: {
            display: true,
            color: PLUMA.verdeEscuro,
            anchor: "end",
            align: "top",
            font: { weight: "bold", size: 10 },
            formatter: v => v > 0 ? v : ""
          }
        },
        scales: {
          x: { stacked: false },
          y: { beginAtZero: true, precision: 0, stacked: false }
        }
      })
    });

    tbodyAfx.innerHTML = "";
    for (let i = 0; i < 12; i++) {
      const a = abertos[i];
      const f = fechados[i];
      tbodyAfx.insertAdjacentHTML("beforeend",
        `<tr><td>${MESES[i]}</td><td>${a}</td><td>${f}</td><td>${a ? ((f/a)*100).toFixed(1)+"%" : "-"}</td></tr>`
      );
    }
  }

  function atualizarGraficoIssueType(lista) {
    const map = contarPorCampo(lista, "Issue Type");

    chartIssueType?.destroy();
    chartIssueType = new Chart(canvasIssue, {
      type: "bar",
      data: {
        labels: Object.keys(map),
        datasets: [{
          data: Object.values(map),
          backgroundColor: PLUMA.amarelo,
          borderRadius: 6
        }]
      },
      options: baseOptions({
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, precision: 0 } }
      })
    });
  }
function atualizarGraficoServico(lista) {
  const map = contarPorCampo(lista, "Serviço");

  chartServico?.destroy();
  chartServico = new Chart(canvasServico, {
    type: "bar",
    data: {
      labels: Object.keys(map),
      datasets: [{
        data: Object.values(map),
        backgroundColor: PLUMA.verdeEscuro,
        borderRadius: 6
      }]
    },
    options: baseOptions({
      plugins: {
        legend: { display: false },

        // ✅ MOSTRA O VALOR EM CADA BARRA
        datalabels: {
          display: true,
          color: "#000",
          anchor: "end",
          align: "top",
          offset: 2,
          font: {
            weight: "bold",
            size: 11
          },
          formatter: (value) => value
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          precision: 0
        }
      }
    })
  });
}

  function atualizarGraficoSeveridade(lista) {
    const map = contarPorCampo(lista, "Severidade");
    const labels = Object.keys(map);
    const values = Object.values(map);
    const cores = [PLUMA.verdeEscuro, PLUMA.verdeMedio, PLUMA.amarelo, PLUMA.verdeClaro, PLUMA.cinza];

    chartSeveridade?.destroy();
    chartSeveridade = new Chart(canvasSev, {
      type: "pie",
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: labels.map((_, i) => cores[i % cores.length])
        }]
      },
      options: baseOptions({
        plugins: { legend: { position: "right" } }
      })
    });
  }

  function atualizarTudo() {
    const filtrados = filtrarDados();
    atualizarKPIs(filtrados);

    atualizarGraficoCriadosMes(filtrados);
    atualizarGraficoIssueType(filtrados);
    atualizarGraficoAbertosFechados(filtrados);
    atualizarGraficoServico(filtrados);
    atualizarGraficoSeveridade(filtrados);
  }

  /* ===== 🔹 ADIÇÃO 2: chamada após load ===== */
  fetch("dados_sr.csv", { cache: "no-store" })
    .then(r => r.text())
    .then(texto => {
      dados = traduzirDadosEmMemoria(parseCSV(texto));

      atualizarAtualizadoEm(dados); // 👈 única chamada nova

      preencherFiltros();
      atualizarTudo();

      filtroServico.addEventListener("change", atualizarTudo);
      filtroStatus.addEventListener("change", atualizarTudo);
      filtroSeveridade.addEventListener("change", atualizarTudo);
    });

})();
