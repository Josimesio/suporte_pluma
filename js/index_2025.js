/* index.js - Página: index.html */

(function () {
  "use strict";

  // ===== UI: status/erro (anti tela branca)
  const statusBox = document.getElementById("statusBox");
  const uploadBox = document.getElementById("uploadBox");
  const fileInput  = document.getElementById("fileInput");

  function setStatus(tipo, html) {
    if (!statusBox) return;
    statusBox.className = `alert alert-${tipo} py-2 mb-0`;
    statusBox.innerHTML = html;
  }

  function showUpload(mostrar) {
    if (!uploadBox) return;
    uploadBox.classList.toggle("d-none", !mostrar);
  }

  window.addEventListener("error", (e) => {
    setStatus("danger", `Erro no JavaScript: <b>${e.message || "desconhecido"}</b>`);
    showUpload(true);
  });

  // ===== CSV Parser
  function parseCSV(texto) {
    return window.SRMetrics.parseCSV(texto);
  }

  function contarPorCampo(lista, campo) {
    const mapa = {};
    (lista || []).forEach(item => {
      const v = (item[campo] || "").trim() || "Não informado";
      mapa[v] = (mapa[v] || 0) + 1;
    });
    return mapa;
  }

  function valoresUnicos(lista, campo) {
    return Array.from(new Set(
      (lista || []).map(item => (item[campo] || "").trim()).filter(v => v !== "")
    )).sort((a,b)=>a.localeCompare(b, "pt-BR"));
  }


  function obterAnoDashboard() {
    const titulo = String(document.title || "");
    const mTitulo = titulo.match(/\b(20\d{2})\b/);
    if (mTitulo) return mTitulo[1];

    const textoPagina = document.body ? document.body.textContent : "";
    const mPagina = String(textoPagina || "").match(/Ano\s+(20\d{2})|Chamados\s+(20\d{2})/);
    if (mPagina) return mPagina[1] || mPagina[2];

    return String(new Date().getFullYear());
  }

  function atualizarTitulosPainelAno() {
    const ano = obterAnoDashboard();
    const tituloTotal = document.getElementById("tituloKpiTotalAno");
    const tituloAbertos = document.getElementById("tituloKpiAbertosAno");
    const tituloFechados = document.getElementById("tituloKpiFechadosAno");

    if (tituloTotal) tituloTotal.textContent = `Total SRs no ano de ${ano}`;
    if (tituloAbertos) tituloAbertos.textContent = `Backlog acumulado do ano de ${ano}`;
    if (tituloFechados) tituloFechados.textContent = `Total SRs fechados no ano de ${ano}`;
  }

  function isFechado(status) {
    return window.SRMetrics.isFechado(status);
  }

  // ===== Atualizado em: coluna "Gerado em" (padrão do dados_sr_2025.csv)
  function atualizarHeaderAtualizadoEm(dados) {
    const el = document.getElementById("atualizadoEm");
    if (!el || !dados || !dados.length) {
      if (el) el.textContent = "-";
      return;
    }

    const normaliza = (s) =>
      String(s || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/_/g, " ");

    const nomesAceitos = [
      "gerado em",
      "atualizado em",
      "gerado_em",
      "atualizado_em"
    ].map(normaliza);

    const chaves = Object.keys(dados[0] || {});
    const chaveEncontrada = chaves.find(k => nomesAceitos.includes(normaliza(k)));

    if (!chaveEncontrada) {
      el.textContent = "-";
      return;
    }

    let ultimo = "";
    for (const r of dados) {
      const v = String(r[chaveEncontrada] || "").trim();
      if (v) ultimo = v;
    }
    el.textContent = ultimo || "-";
  }

  // ===== Estado
  let dadosBrutos = [];

  // ===== Filtros
  function preencherSelect(id, valores) {
    const sel = document.getElementById(id);
    if (!sel) return;

    const atual = sel.value;
    sel.innerHTML = `<option value="">Todos</option>`;
    (valores || []).forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
    if (atual) sel.value = atual;
  }



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
    preencherFiltroCheckbox("filtroServico", valoresUnicos(dadosBrutos, "Serviço"), FILTRO_SERVICO_CONFIG);
    preencherFiltroCheckbox("filtroStatus", valoresUnicos(dadosBrutos, "Status"), FILTRO_STATUS_CONFIG);
    preencherFiltroCheckbox("filtroSeveridade", valoresUnicos(dadosBrutos, "Severidade"), FILTRO_SEVERIDADE_CONFIG);
  }

  function filtrarDados() {
    const servicosSelecionados = obterSelecionadosCheckbox("filtroServico", FILTRO_SERVICO_CONFIG);
    const statusSelecionados = obterSelecionadosCheckbox("filtroStatus", FILTRO_STATUS_CONFIG);
    const severidadesSelecionadas = obterSelecionadosCheckbox("filtroSeveridade", FILTRO_SEVERIDADE_CONFIG);

    return (dadosBrutos || []).filter(item => {
      if (servicosSelecionados.length && !servicosSelecionados.includes(item["Serviço"])) return false;
      if (statusSelecionados.length && !statusSelecionados.includes(item["Status"])) return false;
      if (severidadesSelecionadas.length && !severidadesSelecionadas.includes(item["Severidade"])) return false;
      return true;
    });
  }

  function aplicarBusca(dados) {
    const termo = (document.getElementById("buscaTabela")?.value || "").trim().toLowerCase();
    if (!termo) return dados;

    return (dados || []).filter(d => {
      const campos = [
        d["Número SR"],
        d["Serviço"],
        d["Issue Type"],
        d["Status"],
        d["Severidade"],
        d["Contato Primário"]
      ];
      return campos.some(c => String(c || "").toLowerCase().includes(termo));
    });
  }

  // ===== KPIs
  function atualizarKPIs(dados) {
    const totalEl = document.getElementById("kpiTotal");
    const abertosEl = document.getElementById("kpiAbertos");
    const fechadosEl = document.getElementById("kpiFechados");
    const topModuloEl = document.getElementById("kpiTopModulo");

    if (!totalEl || !abertosEl || !fechadosEl || !topModuloEl) return;

    const kpis = window.SRMetrics.calcularKPIs(dados, Number(obterAnoDashboard()));

    totalEl.textContent = String(kpis.total);
    abertosEl.textContent = String(kpis.abertos);
    fechadosEl.textContent = String(kpis.fechados);

    const porServico = contarPorCampo(dados, "Serviço");
    let top = "-";
    let max = 0;
    for (const [k, v] of Object.entries(porServico)) {
      if (v > max) { max = v; top = k; }
    }
    topModuloEl.textContent = top;
  }

  // ===== Tabela
  function formatarDataTabela(valor) {
    const texto = String(valor || "").trim();
    if (!texto) return "";
    return texto.replace(/(?:\s+|T)00:00(?::00)?(?:\.000)?(?:Z)?$/i, "");
  }

  function atualizarTabela(dados) {
    const tb = document.getElementById("tabelaSRs");
    if (!tb) return;

    tb.innerHTML = "";
    (dados || []).forEach(d => {
      const tr = document.createElement("tr");
      const cols = ["Número SR","Serviço","Issue Type","Status","Severidade","Criado_dt","Atualizado_dt","Contato Primário"];
      cols.forEach(c => {
        const td = document.createElement("td");
        td.textContent = ["Criado_dt", "Atualizado_dt"].includes(c) ? formatarDataTabela(d[c]) : (d[c] || "");
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  }

  function atualizarPagina() {
    let dados = filtrarDados();
    dados = aplicarBusca(dados);
    atualizarKPIs(dados);
    atualizarTabela(dados);
  }

  // ===== Modo TV
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

  // ===== Carregar dados (web + fallback)
  async function carregarDadosViaFetch() {
    const csvUrl = new URL("dados/dados_sr_2025.csv", document.baseURI).href;
    const resp = await fetch(csvUrl, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar ${csvUrl}`);
    return window.SRMetrics.normalizarDados(
      parseCSV(await resp.text()),
      Number(obterAnoDashboard())
    );
  }

  async function iniciar() {
    atualizarTitulosPainelAno();
    document.getElementById("btnTvMode")?.addEventListener("click", toggleTvMode);
    configurarFiltroCheckbox("filtroServico", FILTRO_SERVICO_CONFIG, atualizarPagina);
    configurarFiltroCheckbox("filtroStatus", FILTRO_STATUS_CONFIG, atualizarPagina);
    configurarFiltroCheckbox("filtroSeveridade", FILTRO_SEVERIDADE_CONFIG, atualizarPagina);
    document.getElementById("buscaTabela")?.addEventListener("input", atualizarPagina);

    fileInput?.addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      const texto = await file.text();
      dadosBrutos = window.SRMetrics.normalizarDados(
        parseCSV(texto),
        Number(obterAnoDashboard())
      );
      atualizarHeaderAtualizadoEm(dadosBrutos);
      preencherFiltros();
      atualizarPagina();
      setStatus("success", `Dados carregados via arquivo: <b>${file.name}</b>`);
      showUpload(false);
    });

    try {
      setStatus("info", `Carregando dados... (tentando <b>dados_sr_2025.csv</b>)`);
      dadosBrutos = await carregarDadosViaFetch();
      atualizarHeaderAtualizadoEm(dadosBrutos);
      preencherFiltros();
      atualizarPagina();
      setStatus("success", `Dados carregados com sucesso: <b>${dadosBrutos.length}</b> registros.`);
      showUpload(false);
    } catch (err) {
      console.error(err);
      setStatus(
        "danger",
        `Falha ao carregar <b>dados_sr_2025.csv</b> via web. Motivo: <b>${err.message}</b><br>` +
        `<span class="small">Se estiver em <b>GitHub Pages</b>, confira se o arquivo existe no repositório com o nome exato. Se abriu por <b>file://</b>, selecione o CSV abaixo.</span>`
      );
      showUpload(true);
    }
  }

  iniciar();
})();
