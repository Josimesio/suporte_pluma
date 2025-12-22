/* ===============================
   graficos.js – Dashboard Pluma
   (robusto + meses Jan-Dez)
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

  /* ===== DOM (NÃO depender de global por id) ===== */
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

  // Se faltar algo essencial, aborta com log (evita branco sem pista)
  const essenciais = [filtroServico, filtroStatus, filtroSeveridade, canvasCriados, canvasIssue, canvasAfx, canvasServico, canvasSev, tbodyAfx];
  if (essenciais.some(x => !x)) {
    console.error("IDs essenciais não encontrados no HTML. Verifique graficos.html.", {
      filtroServico: !!filtroServico,
      filtroStatus: !!filtroStatus,
      filtroSeveridade: !!filtroSeveridade,
      graficoPorData: !!canvasCriados,
      graficoPorIssueType: !!canvasIssue,
      graficoAbertosFechadosMes: !!canvasAfx,
      graficoPorServico: !!canvasServico,
      graficoPorSeveridade: !!canvasSev,
      rankingAbertosFechadosMes: !!tbodyAfx
    });
    return;
  }

  /* ===== CSV Parser (com aspas) ===== */
  function parseCSV(texto) {
    const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== "");
    if (!linhas.length) return [];

    const cab = linhas[0].split(",").map(h => h.trim().replace(/^\uFEFF/, ""));
    const out = [];

    for (let i = 1; i < linhas.length; i++) {
      // split por vírgula respeitando aspas
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

    // normaliza "YYYY-MM-DD HH:MM" -> ISO
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s)) s = s.replace(" ", "T");

    let d = new Date(s);
    if (!isNaN(d)) return d;

    // tenta dd/MM/yyyy HH:mm(:ss)
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
    return s.includes("closed") || s.includes("resolved") || s.includes("close requested");
  }

  function contarPorCampo(lista, campo) {
    const map = {};
    lista.forEach(l => {
      const v = (l[campo] || "Não informado").trim() || "Não informado";
      map[v] = (map[v] || 0) + 1;
    });
    return map;
  }

  /* ===== Config base (igual ao padrão anterior) ===== */
  function baseOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,  // anti “crescimento”
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

  /* ===== Header "Atualizado em" ===== */
  function atualizarAtualizadoEm() {
    if (!atualizadoEm) return;
    const v = (dados?.[0]?.["Gerado em"] || "").trim();
    atualizadoEm.textContent = v || "-";
  }

  /* ===== Preencher filtros ===== */
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
    if (!kpiTotal) return;
    const total = lista.length;
    const fech = lista.filter(d => isFechado(d["Status"])).length;

    kpiTotal.textContent = total;
    if (kpiFechados) kpiFechados.textContent = fech;
    if (kpiAbertos)  kpiAbertos.textContent  = total - fech;

    if (kpiTopModulo) {
      const porServ = contarPorCampo(lista, "Serviço");
      const top = Object.entries(porServ).sort((a,b)=>b[1]-a[1])[0];
      kpiTopModulo.textContent = top ? top[0] : "-";
    }
  }

  /* ===== 1) SRs criados por mês (Jan-Dez) ===== */
  function atualizarGraficoCriadosMes(lista) {
    const contagem = Array(12).fill(0);

    lista.forEach(d => {
      const dt = parseDataFlex(d["Criado_dt"]);
      if (!dt) return;
      contagem[dt.getMonth()]++;
    });

    chartCriadosMes?.destroy();
    chartCriadosMes = new Chart(canvasCriados, {
      type: "bar",
      data: {
        labels: MESES,
        datasets: [{
          label: "Criados",
          data: contagem,
          backgroundColor: PLUMA.verdeMedio,
          borderRadius: 6
        }]
      },
      options: baseOptions({
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, precision: 0 } }
      })
    });
  }

  /* ===== 2) SRs Abertos x Fechados (lado a lado + Jan-Dez) ===== */
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
    // mostra os números em cima das barras SÓ neste gráfico
    datalabels: {
      display: true,
      color: PLUMA.verdeEscuro,
      anchor: "end",
      align: "top",
      offset: 2,
      font: { weight: "bold", size: 10 },
      formatter: (v) => (v && v > 0 ? v : "")
    },
    legend: { labels: { color: PLUMA.verdeEscuro } }
  },
  scales: {
    x: { stacked: false },
    y: { beginAtZero: true, precision: 0, stacked: false }
  }
})

    });

    // tabela lateral
    tbodyAfx.innerHTML = "";
    for (let i = 0; i < 12; i++) {
      const a = abertos[i];
      const f = fechados[i];
      const pct = a ? ((f / a) * 100).toFixed(1) + "%" : "-";
      tbodyAfx.insertAdjacentHTML("beforeend",
        `<tr><td>${MESES[i]}</td><td>${a}</td><td>${f}</td><td>${pct}</td></tr>`
      );
    }
  }

  /* ===== 3) Issue Type ===== */
  function atualizarGraficoIssueType(lista) {
    const map = contarPorCampo(lista, "Issue Type");

    chartIssueType?.destroy();
    chartIssueType = new Chart(canvasIssue, {
      type: "bar",
      data: {
        labels: Object.keys(map),
        datasets: [{
          label: "Issue Type",
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

  /* ===== 4) Serviço ===== */
  function atualizarGraficoServico(lista) {
    const map = contarPorCampo(lista, "Serviço");

    chartServico?.destroy();
    chartServico = new Chart(canvasServico, {
      type: "bar",
      data: {
        labels: Object.keys(map),
        datasets: [{
          label: "Serviço",
          data: Object.values(map),
          backgroundColor: PLUMA.verdeEscuro,
          borderRadius: 6
        }]
      },
      options: baseOptions({
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, precision: 0 } }
      })
    });
  }

  /* ===== 5) Severidade (pizza Pluma) ===== */
  function atualizarGraficoSeveridade(lista) {
    const map = contarPorCampo(lista, "Severidade");
    const labels = Object.keys(map);
    const values = Object.values(map);

    const cores = [
      PLUMA.verdeEscuro,
      PLUMA.verdeMedio,
      PLUMA.amarelo,
      PLUMA.verdeClaro,
      PLUMA.cinza
    ];

    chartSeveridade?.destroy();
    chartSeveridade = new Chart(canvasSev, {
      type: "pie",
      data: {
        labels,
        datasets: [{
          label: "Severidade",
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

  /* ===== Boot ===== */
  fetch("dados_sr.csv", { cache: "no-store" })
    .then(r => {
      if (!r.ok) throw new Error("Falha ao carregar dados_sr.csv: HTTP " + r.status);
      return r.text();
    })
    .then(texto => {
      dados = parseCSV(texto);
      atualizarAtualizadoEm();
      preencherFiltros();
      atualizarTudo();

      filtroServico.addEventListener("change", atualizarTudo);
      filtroStatus.addEventListener("change", atualizarTudo);
      filtroSeveridade.addEventListener("change", atualizarTudo);
    })
    .catch(err => {
      console.error(err);
      alert("Erro ao carregar gráficos. Abra o console (F12) para ver detalhes.");
    });

})();
