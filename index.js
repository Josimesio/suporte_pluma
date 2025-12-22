/* index.js - Página: index.html */

(function () {
  // ===== CSV Parser (robusto com aspas e BOM)
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
      // ignora linha vazia
      if (Object.values(obj).some(v => String(v || "").trim() !== "")) dados.push(obj);
    }
    return dados;
  }

  function atualizarHeaderAtualizadoEm(dados) {
    const el = document.getElementById("atualizadoEm");
    if (!el) return;
    const col = "Gerado em";
    const v = (dados && dados.length && dados[0] && dados[0][col]) ? String(dados[0][col]).trim() : "";
    el.textContent = v || "-";
  }

  function valoresUnicos(lista, campo) {
    return Array.from(new Set(
      lista.map(item => (item[campo] || "").trim()).filter(v => v !== "")
    )).sort();
  }

  function contarPorCampo(lista, campo) {
    const mapa = {};
    lista.forEach(item => {
      const valor = (item[campo] || "Não informado").trim() || "Não informado";
      mapa[valor] = (mapa[valor] || 0) + 1;
    });
    return mapa;
  }

  // ===== Estado
  let dadosBrutos = [];

  // ===== Filtros
  function preencherFiltros() {
    const selServico = document.getElementById("filtroServico");
    const selStatus = document.getElementById("filtroStatus");
    const selSeveridade = document.getElementById("filtroSeveridade");

    if (selServico) {
      valoresUnicos(dadosBrutos, "Serviço").forEach(v => {
        selServico.insertAdjacentHTML("beforeend", `<option value="${v}">${v}</option>`);
      });
    }
    if (selStatus) {
      valoresUnicos(dadosBrutos, "Status").forEach(v => {
        selStatus.insertAdjacentHTML("beforeend", `<option value="${v}">${v}</option>`);
      });
    }
    if (selSeveridade) {
      valoresUnicos(dadosBrutos, "Severidade").forEach(v => {
        selSeveridade.insertAdjacentHTML("beforeend", `<option value="${v}">${v}</option>`);
      });
    }
  }

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
    const termo = (document.getElementById("buscaTabela")?.value || "").trim().toLowerCase();
    if (!termo) return dados;

    const campos = ["Número SR", "Serviço", "Issue Type", "Status", "Contato Primário"];
    return dados.filter(d => campos.some(c => (d[c] || "").toLowerCase().includes(termo)));
  }

  // ===== KPIs
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

    totalEl.textContent = total;
    abertosEl.textContent = total - fechados;
    fechadosEl.textContent = fechados;

    const porServico = contarPorCampo(dados, "Serviço");
    let top = "-";
    let max = 0;
    for (const [k, v] of Object.entries(porServico)) {
      if (v > max) { max = v; top = k; }
    }
    topModuloEl.textContent = top;
  }

  // ===== Tabela
  function atualizarTabela(dados) {
    const tbody = document.getElementById("tabelaSRs");
    if (!tbody) return;

    tbody.innerHTML = "";
    dados.forEach(d => {
      const tr = document.createElement("tr");
      const cols = ["Número SR", "Serviço", "Issue Type", "Status", "Severidade", "Criado_dt", "Atualizado_dt", "Contato Primário"];
      cols.forEach(c => {
        const td = document.createElement("td");
        td.textContent = d[c] || "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function atualizarPagina() {
    let filtrados = filtrarDados();
    filtrados = aplicarBusca(filtrados);
    atualizarKPIs(filtrados);
    atualizarTabela(filtrados);
  }

  // ===== Init
  async function carregarDados() {
    const resp = await fetch("dados_sr.csv", { cache: "no-store" });
    if (!resp.ok) throw new Error(`Falha ao carregar dados_sr.csv (HTTP ${resp.status})`);
    const texto = await resp.text();

    dadosBrutos = parseCSV(texto);
    atualizarHeaderAtualizadoEm(dadosBrutos);
    preencherFiltros();
    atualizarPagina();

    document.getElementById("filtroServico")?.addEventListener("change", atualizarPagina);
    document.getElementById("filtroStatus")?.addEventListener("change", atualizarPagina);
    document.getElementById("filtroSeveridade")?.addEventListener("change", atualizarPagina);
    document.getElementById("buscaTabela")?.addEventListener("input", atualizarPagina);
  }

  carregarDados().catch(err => {
    console.error(err);
    alert("Erro ao carregar dados do dashboard. Veja o console (F12).");
  });
})();
/* index.js - Página: index.html */

(function () {
  // ===== CSV Parser (robusto com aspas e BOM)
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
      // ignora linha vazia
      if (Object.values(obj).some(v => String(v || "").trim() !== "")) dados.push(obj);
    }
    return dados;
  }

  function atualizarHeaderAtualizadoEm(dados) {
    const el = document.getElementById("atualizadoEm");
    if (!el) return;
    const col = "Gerado em";
    const v = (dados && dados.length && dados[0] && dados[0][col]) ? String(dados[0][col]).trim() : "";
    el.textContent = v || "-";
  }

  function valoresUnicos(lista, campo) {
    return Array.from(new Set(
      lista.map(item => (item[campo] || "").trim()).filter(v => v !== "")
    )).sort();
  }

  function contarPorCampo(lista, campo) {
    const mapa = {};
    lista.forEach(item => {
      const valor = (item[campo] || "Não informado").trim() || "Não informado";
      mapa[valor] = (mapa[valor] || 0) + 1;
    });
    return mapa;
  }

  // ===== Estado
  let dadosBrutos = [];

  // ===== Filtros
  function preencherFiltros() {
    const selServico = document.getElementById("filtroServico");
    const selStatus = document.getElementById("filtroStatus");
    const selSeveridade = document.getElementById("filtroSeveridade");

    if (selServico) {
      valoresUnicos(dadosBrutos, "Serviço").forEach(v => {
        selServico.insertAdjacentHTML("beforeend", `<option value="${v}">${v}</option>`);
      });
    }
    if (selStatus) {
      valoresUnicos(dadosBrutos, "Status").forEach(v => {
        selStatus.insertAdjacentHTML("beforeend", `<option value="${v}">${v}</option>`);
      });
    }
    if (selSeveridade) {
      valoresUnicos(dadosBrutos, "Severidade").forEach(v => {
        selSeveridade.insertAdjacentHTML("beforeend", `<option value="${v}">${v}</option>`);
      });
    }
  }

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
    const termo = (document.getElementById("buscaTabela")?.value || "").trim().toLowerCase();
    if (!termo) return dados;

    const campos = ["Número SR", "Serviço", "Issue Type", "Status", "Contato Primário"];
    return dados.filter(d => campos.some(c => (d[c] || "").toLowerCase().includes(termo)));
  }

  // ===== KPIs
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

    totalEl.textContent = total;
    abertosEl.textContent = total - fechados;
    fechadosEl.textContent = fechados;

    const porServico = contarPorCampo(dados, "Serviço");
    let top = "-";
    let max = 0;
    for (const [k, v] of Object.entries(porServico)) {
      if (v > max) { max = v; top = k; }
    }
    topModuloEl.textContent = top;
  }

  // ===== Tabela
  function atualizarTabela(dados) {
    const tbody = document.getElementById("tabelaSRs");
    if (!tbody) return;

    tbody.innerHTML = "";
    dados.forEach(d => {
      const tr = document.createElement("tr");
      const cols = ["Número SR", "Serviço", "Issue Type", "Status", "Severidade", "Criado_dt", "Atualizado_dt", "Contato Primário"];
      cols.forEach(c => {
        const td = document.createElement("td");
        td.textContent = d[c] || "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function atualizarPagina() {
    let filtrados = filtrarDados();
    filtrados = aplicarBusca(filtrados);
    atualizarKPIs(filtrados);
    atualizarTabela(filtrados);
  }

  // ===== Init
  async function carregarDados() {
    const resp = await fetch("dados_sr.csv", { cache: "no-store" });
    if (!resp.ok) throw new Error(`Falha ao carregar dados_sr.csv (HTTP ${resp.status})`);
    const texto = await resp.text();

    dadosBrutos = parseCSV(texto);
    atualizarHeaderAtualizadoEm(dadosBrutos);
    preencherFiltros();
    atualizarPagina();

    document.getElementById("filtroServico")?.addEventListener("change", atualizarPagina);
    document.getElementById("filtroStatus")?.addEventListener("change", atualizarPagina);
    document.getElementById("filtroSeveridade")?.addEventListener("change", atualizarPagina);
    document.getElementById("buscaTabela")?.addEventListener("input", atualizarPagina);
  }

  carregarDados().catch(err => {
    console.error(err);
    alert("Erro ao carregar dados do dashboard. Veja o console (F12).");
  });
})();
