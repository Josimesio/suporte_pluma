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
  const traduzir = valor => window.PLUMA_TRADUCAO?.traduzir(valor) || valor;

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
    return window.SRMetrics ? window.SRMetrics.parseCSV(texto) : [];
  }

  function valoresUnicos(lista, campo) {
    return Array.from(new Set(lista.map(i => (i[campo] || "").trim()).filter(Boolean))).sort();
  }

  /* ===== Datas e métricas unificadas ===== */

  function obterAnoDashboard() {
    const encontrado = window.location.pathname.match(/_(2025|2026)\.html$/i);
    return encontrado ? Number(encontrado[1]) : 2026;
  }

  function parseDataFlex(valor) {
    return window.SRMetrics.parseData(valor, window.__GERADO_EM_REF__);
  }

  function isFechado(status) {
    return window.SRMetrics.isFechado(status);
  }

  function contarPorCampo(lista, campo) {
    return window.SRMetrics.contarPorCampo(lista, campo);
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


  function montarHtmlFiltroCheckbox(rotuloTodos, dataTodosAttr) {
    return `
      <button type="button" class="status-dropdown-toggle" aria-expanded="false">
        <span class="status-dropdown-text">${rotuloTodos}</span>
        <span class="status-dropdown-arrow" aria-hidden="true">▾</span>
      </button>
      <div class="status-dropdown-menu">
        <label class="status-check status-check-all">
          <input type="checkbox" value="" checked ${dataTodosAttr}>
          <span>${rotuloTodos}</span>
        </label>
      </div>
    `;
  }

  function obterAreaOpcoesCheckbox(box) {
    return box?.querySelector(".status-dropdown-menu") || box;
  }

  function atualizarResumoFiltroCheckbox(box, config) {
    if (!box) return;
    const texto = box.querySelector(".status-dropdown-text");
    if (!texto) return;

    const selecionados = Array.from(box.querySelectorAll(`input[type="checkbox"]:not([${config.dataTodosAttr}]):checked`))
      .map(input => input.value)
      .filter(Boolean);

    if (!selecionados.length) {
      texto.textContent = config.rotuloTodos;
    } else if (selecionados.length === 1) {
      texto.textContent = selecionados[0];
    } else {
      texto.textContent = `${selecionados.length} ${config.nomePlural} selecionados`;
    }
  }

  function configurarDropdownCheckbox(box) {
    if (!box || box.dataset.dropdownConfigurado === "true") return;
    box.dataset.dropdownConfigurado = "true";

    box.addEventListener("click", (ev) => {
      const botao = ev.target.closest?.(".status-dropdown-toggle");
      if (!botao) return;
      ev.preventDefault();
      const aberto = box.classList.toggle("is-open");
      botao.setAttribute("aria-expanded", aberto ? "true" : "false");
    });

    if (!window.__checkboxDropdownClickForaConfigurado) {
      window.__checkboxDropdownClickForaConfigurado = true;
      document.addEventListener("click", (ev) => {
        document.querySelectorAll(".status-checkbox-filter.is-open").forEach(container => {
          if (container.contains(ev.target)) return;
          container.classList.remove("is-open");
          const botao = container.querySelector(".status-dropdown-toggle");
          if (botao) botao.setAttribute("aria-expanded", "false");
        });
      });
    }
  }

  function preencherFiltroCheckbox(id, valores, config) {
    const box = document.getElementById(id);
    if (!box) return;

    const selecionadosAntes = Array.from(box.querySelectorAll('input[type="checkbox"]:checked'))
      .map(input => input.value)
      .filter(Boolean);

    box.innerHTML = montarHtmlFiltroCheckbox(config.rotuloTodos, config.dataTodosAttr);
    const areaOpcoes = obterAreaOpcoesCheckbox(box);

    (valores || []).forEach(v => {
      const label = document.createElement("label");
      label.className = "status-check";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = v;
      input.checked = selecionadosAntes.includes(v);

      const span = document.createElement("span");
      span.textContent = v;

      label.appendChild(input);
      label.appendChild(span);
      areaOpcoes.appendChild(label);
    });

    const possuiSelecao = Array.from(box.querySelectorAll(`input[type="checkbox"]:not([${config.dataTodosAttr}])`)).some(input => input.checked);
    const todos = box.querySelector(`[${config.dataTodosAttr}]`);
    if (todos) todos.checked = !possuiSelecao;
    atualizarResumoFiltroCheckbox(box, config);
  }

  function obterSelecionadosCheckbox(id, config) {
    const box = document.getElementById(id);
    if (!box) return [];
    const todos = box.querySelector(`[${config.dataTodosAttr}]`);
    if (todos?.checked) return [];
    return Array.from(box.querySelectorAll(`input[type="checkbox"]:not([${config.dataTodosAttr}]):checked`))
      .map(input => input.value)
      .filter(Boolean);
  }

  function configurarFiltroCheckbox(id, config, callback) {
    const box = document.getElementById(id);
    if (!box || box.dataset.filtroCheckboxConfigurado === "true") return;
    box.dataset.filtroCheckboxConfigurado = "true";

    configurarDropdownCheckbox(box);
    atualizarResumoFiltroCheckbox(box, config);

    box.addEventListener("change", (ev) => {
      const alvo = ev.target;
      if (!(alvo instanceof HTMLInputElement)) return;

      const todos = box.querySelector(`[${config.dataTodosAttr}]`);
      const opcoes = Array.from(box.querySelectorAll(`input[type="checkbox"]:not([${config.dataTodosAttr}])`));

      if (alvo.hasAttribute(config.dataTodosAttr)) {
        if (alvo.checked) opcoes.forEach(input => input.checked = false);
      } else {
        if (todos) todos.checked = !opcoes.some(input => input.checked);
      }

      atualizarResumoFiltroCheckbox(box, config);
      if (typeof callback === "function") callback();
    });
  }

  const FILTRO_SERVICO_CONFIG = { rotuloTodos: "Todos", dataTodosAttr: "data-servico-todos", nomePlural: "serviços" };
  const FILTRO_STATUS_CONFIG = { rotuloTodos: "Todos", dataTodosAttr: "data-status-todos", nomePlural: "status" };
  const FILTRO_SEVERIDADE_CONFIG = { rotuloTodos: "Todas", dataTodosAttr: "data-severidade-todos", nomePlural: "severidades" };

  function preencherFiltros() {
    preencherFiltroCheckbox("filtroServico", valoresUnicos(dados, "Serviço"), FILTRO_SERVICO_CONFIG);
    preencherFiltroCheckbox("filtroStatus", valoresUnicos(dados, "Status"), FILTRO_STATUS_CONFIG);
    preencherFiltroCheckbox("filtroSeveridade", valoresUnicos(dados, "Severidade"), FILTRO_SEVERIDADE_CONFIG);
  }

  function filtrarDados() {
    const servicosSelecionados = obterSelecionadosCheckbox("filtroServico", FILTRO_SERVICO_CONFIG);
    const statusSelecionados = obterSelecionadosCheckbox("filtroStatus", FILTRO_STATUS_CONFIG);
    const severidadesSelecionadas = obterSelecionadosCheckbox("filtroSeveridade", FILTRO_SEVERIDADE_CONFIG);

    return dados.filter(d => {
      if (servicosSelecionados.length && !servicosSelecionados.includes(d["Serviço"])) return false;
      if (statusSelecionados.length && !statusSelecionados.includes(d["Status"])) return false;
      if (severidadesSelecionadas.length && !severidadesSelecionadas.includes(d["Severidade"])) return false;
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


  function calcularSeriesMensais(lista) {
    const criados = Array(12).fill(0);
    const fechados = Array(12).fill(0);
    let semDataAbertura = 0;
    let semDataFechamento = 0;
    const ano = obterAnoDashboard();

    (lista || []).forEach(d => {
      const dataAbertura = parseDataFlex(d["Criado_dt"]);
      if (dataAbertura) criados[dataAbertura.getMonth()]++;
      else semDataAbertura++;

      if (isFechado(d["Status"])) {
        let dataFechamento = parseDataFlex(d["Atualizado_dt"]);

        // Preserva a regra já utilizada pela página de 2025.
        if (ano === 2025 && !dataFechamento) dataFechamento = parseDataFlex(d["Criado_dt"]);
        if (ano === 2025 && !dataFechamento) dataFechamento = parseDataFlex(d["Gerado em"] || d["Gerado_em"]);

        if (dataFechamento) fechados[dataFechamento.getMonth()]++;
        else semDataFechamento++;
      }
    });

    if (semDataAbertura || semDataFechamento) {
      console.warn("SRs ignorados por data inválida (abertura/fechamento):", semDataAbertura, semDataFechamento);
    }

    return { criados, fechados };
  }

  /* ===== GRÁFICOS ===== */

  function atualizarGraficoCriadosMes(lista) {
    const series = window.SRMetrics.calcularSeriesMensais(lista, obterAnoDashboard());
    const contagem = series.abertos;

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
    const series = window.SRMetrics.calcularSeriesMensais(lista, obterAnoDashboard());
    const abertos = series.abertos;
    const fechados = series.fechados;

    if (series.semDataAbertura.length || series.semDataFechamento.length) {
      console.warn("SRs com datas incompletas:", {
        semDataAbertura: series.semDataAbertura.length,
        semDataFechamento: series.semDataFechamento.length
      });
    }

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
        labels: Object.keys(map).map(traduzir),
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
      labels: Object.keys(map).map(traduzir),
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
    const labels = Object.keys(map).map(traduzir);
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
  fetch(`dados/dados_sr_${obterAnoDashboard()}.csv`, { cache: "no-store" })
    .then(r => r.text())
    .then(texto => {
      dados = parseCSV(texto);

      atualizarAtualizadoEm(dados); // 👈 única chamada nova

      preencherFiltros();
      atualizarTudo();

      configurarFiltroCheckbox("filtroServico", FILTRO_SERVICO_CONFIG, atualizarTudo);
      configurarFiltroCheckbox("filtroStatus", FILTRO_STATUS_CONFIG, atualizarTudo);
      configurarFiltroCheckbox("filtroSeveridade", FILTRO_SEVERIDADE_CONFIG, atualizarTudo);
    });

})();
