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
    const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== "");
    if (!linhas.length) return [];

    const cabecalho = linhas[0].split(",").map(h => h.trim());
    if (cabecalho[0]) cabecalho[0] = cabecalho[0].replace(/^\uFEFF/, "");

    const dados = [];
    for (let i = 1; i < linhas.length; i++) {
      const cols = linhas[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      const obj = {};
      for (let j = 0; j < cabecalho.length; j++) {
        obj[cabecalho[j]] = (cols[j] || "").replace(/^"|"$/g, "").trim();
      }
      if (Object.values(obj).some(v => String(v || "").trim() !== "")) dados.push(obj);
    }
    return dados;
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

  // ===== Datas flexíveis do Oracle / CSV
  function parseDataRelativa(valor, baseRef) {
    const m = String(valor || "").trim()
      .match(/^(Today|Yesterday)\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;

    const base = baseRef ? new Date(baseRef) : new Date();
    if (isNaN(base)) return null;

    if (/yesterday/i.test(m[1])) base.setDate(base.getDate() - 1);

    let hh = parseInt(m[2], 10);
    const mm = parseInt(m[3], 10);
    const ap = String(m[4] || "").toUpperCase();

    if (ap === "PM" && hh < 12) hh += 12;
    if (ap === "AM" && hh === 12) hh = 0;

    base.setHours(hh, mm, 0, 0);
    return base;
  }

  function parseDataFlex(valor) {
    if (!valor) return null;
    let s = String(valor).trim().replace(/^"|"$/g, "").trim();
    if (!s) return null;

    const dRel = parseDataRelativa(s, window.__GERADO_EM_REF__);
    if (dRel) return dRel;

    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s)) s = s.replace(" ", "T");

    let d = new Date(s);
    if (!isNaN(d)) return d;

    const mBr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (mBr) {
      const dia = parseInt(mBr[1], 10);
      const mes = parseInt(mBr[2], 10) - 1;
      let ano = parseInt(mBr[3], 10);
      if (ano < 100) ano += 2000;
      const hh = parseInt(mBr[4] || "0", 10);
      const mm = parseInt(mBr[5] || "0", 10);
      const ss = parseInt(mBr[6] || "0", 10);
      d = new Date(ano, mes, dia, hh, mm, ss);
      if (!isNaN(d)) return d;
    }

    const mEng = s.match(/^([A-Za-z]{3})\s+(\d{1,2})(?:,)?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?$/);
    if (mEng) {
      const mesesEng = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
      const mon = mesesEng[mEng[1]];
      if (mon !== undefined) {
        let hh = parseInt(mEng[4] || "0", 10);
        const mm = parseInt(mEng[5] || "0", 10);
        const ap = String(mEng[6] || "").toUpperCase();
        if (ap === "PM" && hh < 12) hh += 12;
        if (ap === "AM" && hh === 12) hh = 0;
        d = new Date(parseInt(mEng[3], 10), mon, parseInt(mEng[2], 10), hh, mm, 0);
        if (!isNaN(d)) return d;
      }
    }

    return null;
  }

  function isFechado(status) {
    const st = String(status || "").toLowerCase();
    return st.includes("closed") || st.includes("close requested") || st.includes("resolved") || st.includes("fechado");
  }

  function obterReferenciaMesAtual() {
    const hoje = new Date();
    return {
      ano: hoje.getFullYear(),
      mes: hoje.getMonth(),
      nome: hoje.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    };
  }

  // ===== Atualizado em: coluna "Gerado em" (padrão do dados_sr_2026.csv)
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
    if (ultimo) window.__GERADO_EM_REF__ = ultimo;
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

    const total = (dados || []).length;

    const fechados = (dados || []).filter(d => isFechado(d["Status"])).length;

    totalEl.textContent = String(total);
    abertosEl.textContent = String(total - fechados);
    fechadosEl.textContent = String(fechados);

    const porServico = contarPorCampo(dados, "Serviço");
    let top = "-";
    let max = 0;
    for (const [k, v] of Object.entries(porServico)) {
      if (v > max) { max = v; top = k; }
    }
    topModuloEl.textContent = top;
  }

  function atualizarKPIsMesCorrente(dados) {
    const totalEl = document.getElementById("kpiMesTotal");
    const abertosEl = document.getElementById("kpiMesAbertos");
    const fechadosEl = document.getElementById("kpiMesFechados");
    const nomeEl = document.getElementById("kpiMesNome");
    const refEl = document.getElementById("kpiMesReferencia");

    if (!totalEl || !abertosEl || !fechadosEl || !nomeEl) return;

    const ref = obterReferenciaMesAtual();
    let criadosNoMes = 0;
    let abertosNoMes = 0;
    let fechadosNoMes = 0;

    (dados || []).forEach(d => {
      // Mesma regra do gráfico "SRs Abertos x Fechados por mês".
      // Abertos/criados: usa somente Criado_dt.
      const dataAbertura = parseDataFlex(d["Criado_dt"]);

      if (dataAbertura && dataAbertura.getFullYear() === ref.ano && dataAbertura.getMonth() === ref.mes) {
        criadosNoMes++;
        abertosNoMes++;
      }

      // Fechados: usa Atualizado_dt e cai para Criado_dt/Gerado em se necessário.
      if (isFechado(d["Status"])) {
        let dataFechamento = parseDataFlex(d["Atualizado_dt"]);
        if (!dataFechamento) dataFechamento = parseDataFlex(d["Criado_dt"]);
        if (!dataFechamento) dataFechamento = parseDataFlex(d["Gerado em"] || d["Gerado_em"]);

        if (dataFechamento && dataFechamento.getFullYear() === ref.ano && dataFechamento.getMonth() === ref.mes) {
          fechadosNoMes++;
        }
      }
    });

    const nome = ref.nome.charAt(0).toUpperCase() + ref.nome.slice(1);

    totalEl.textContent = String((dadosBrutos || []).length);
    abertosEl.textContent = String(abertosNoMes);
    fechadosEl.textContent = String(fechadosNoMes);
    nomeEl.textContent = nome;
    if (refEl) refEl.textContent = nome;
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
    atualizarKPIsMesCorrente(dados);
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
    const csvUrl = new URL("dados/dados_sr_2026.csv", document.baseURI).href;
    const resp = await fetch(csvUrl, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar ${csvUrl}`);
    return parseCSV(await resp.text());
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
      dadosBrutos = parseCSV(texto);
      atualizarHeaderAtualizadoEm(dadosBrutos);
      preencherFiltros();
      atualizarPagina();
      setStatus("success", `Dados carregados via arquivo: <b>${file.name}</b>`);
      showUpload(false);
    });

    try {
      setStatus("info", `Carregando dados... (tentando <b>dados_sr_2026.csv</b>)`);
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
        `Falha ao carregar <b>dados_sr_2026.csv</b> via web. Motivo: <b>${err.message}</b><br>` +
        `<span class="small">Se estiver em <b>GitHub Pages</b>, confira se o arquivo existe no repositório com o nome exato. Se abriu por <b>file://</b>, selecione o CSV abaixo.</span>`
      );
      showUpload(true);
    }
  }

  iniciar();
})();
