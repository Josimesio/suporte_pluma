/* sla.js - Página de SLA dos chamados Oracle
   Lê preferencialmente o CSV bruto MOSSrSearchExport_YYYY.csv.
   Fallback: dados_sr_YYYY.csv, mantendo a página funcional para ajustes futuros.
*/
(function () {
  "use strict";

  if (window.Chart && window.ChartDataLabels) Chart.register(ChartDataLabels);

  const PLUMA = {
    verdeEscuro: "#003F35",
    verdeMedio: "#006E51",
    verdeClaro: "#77C29B",
    amarelo: "#F2C700",
    vermelho: "#B42318",
    laranja: "#F97316",
    cinza: "#9AA0A6"
  };

  const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  const $ = (id) => document.getElementById(id);
  const statusBox = $("statusBox");
  const uploadBox = $("uploadBox");
  const fileInput = $("fileInput");
  const atualizadoEm = $("atualizadoEm");
  const fonteDados = $("fonteDados");

  let dadosBrutos = [];
  let linhasSla = [];
  let chartMes = null;
  let chartSev = null;
  let chartServico = null;

  // Estado da ordenação da tabela SLA
  // null = mantém padrão original: maior risco primeiro
  let ordenacaoTabela = { campo: null, direcao: "asc" };

  function setStatus(tipo, html) {
    if (!statusBox) return;
    statusBox.className = `alert alert-${tipo} py-2 mb-0`;
    statusBox.innerHTML = html;
  }

  function normalizaNome(s) {
    return String(s || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function detectarDelimitador(headerLine) {
    const candidatos = [",", ";", "\t", "|"];
    let melhor = ",";
    let maxCols = 0;
    candidatos.forEach(d => {
      const qtd = headerLine.split(d).length;
      if (qtd > maxCols) { maxCols = qtd; melhor = d; }
    });
    return melhor;
  }

  function splitLinhaCSV(line, delim) {
    const out = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delim && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function limparValor(v) {
    return String(v ?? "")
      .replace(/^\uFEFF/, "")
      .replace(/^="(.*)"$/, "$1")
      .replace(/^"|"$/g, "")
      .trim();
  }

  function parseCSV(texto) {
    const linhas = String(texto || "").split(/\r?\n/).filter(l => l.trim() !== "");
    if (!linhas.length) return [];

    const headerLine = linhas[0].replace(/^\uFEFF/, "");
    const delim = detectarDelimitador(headerLine);
    const headers = splitLinhaCSV(headerLine, delim).map(h => limparValor(h));

    const dados = [];
    for (let i = 1; i < linhas.length; i++) {
      const cols = splitLinhaCSV(linhas[i], delim);
      const obj = {};
      headers.forEach((h, idx) => obj[h] = limparValor(cols[idx]));
      if (Object.values(obj).some(v => String(v || "").trim() !== "")) dados.push(obj);
    }
    return dados;
  }

  function getCampo(row, nomes) {
    const mapa = {};
    Object.keys(row || {}).forEach(k => mapa[normalizaNome(k)] = k);
    for (const nome of nomes) {
      const key = mapa[normalizaNome(nome)];
      if (key !== undefined) return row[key];
    }
    return "";
  }

  function getColunaExistente(row, nomes) {
    const mapa = {};
    Object.keys(row || {}).forEach(k => mapa[normalizaNome(k)] = k);
    for (const nome of nomes) {
      const key = mapa[normalizaNome(nome)];
      if (key !== undefined) return key;
    }
    return null;
  }

  function parseDataRelativa(valor, baseRef) {
    const m = String(valor || "").trim().match(/^(Today|Yesterday)\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;

    const base = baseRef ? new Date(baseRef) : new Date();
    if (isNaN(base)) return null;
    if (/yesterday/i.test(m[1])) base.setDate(base.getDate() - 1);

    let hh = parseInt(m[2], 10);
    const mm = parseInt(m[3], 10);
    const ap = String(m[4]).toUpperCase();
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
      let ano = parseInt(mBr[3], 10);
      if (ano < 100) ano += 2000;
      d = new Date(
        ano,
        parseInt(mBr[2], 10) - 1,
        parseInt(mBr[1], 10),
        parseInt(mBr[4] || "0", 10),
        parseInt(mBr[5] || "0", 10),
        parseInt(mBr[6] || "0", 10)
      );
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

  function fmtData(dt) {
    if (!dt || isNaN(dt)) return "";
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function diffDias(inicio, fim) {
    if (!inicio || !fim) return null;
    const ms = fim.getTime() - inicio.getTime();
    return Math.max(0, Math.ceil(ms / 86400000));
  }

  function isFechado(status, closedRaw) {
    const st = String(status || "").toLowerCase();
    if (String(closedRaw || "").trim()) return true;
    return st.includes("closed") || st.includes("close requested") || st.includes("resolved") || st.includes("fechado");
  }

  function obterAnoPagina() {
    const txt = `${document.title || ""} ${document.body?.textContent || ""}`;
    const m = txt.match(/\b(20\d{2})\b/);
    return m ? m[1] : String(new Date().getFullYear());
  }

  function calcularLinhaSLA(row) {
    const sr = getCampo(row, ["SR Number", "Número SR", "Numero SR"]);
    const resumo = getCampo(row, ["Summary", "Resumo", "Issue Type", "Issue Type "]);
    const issueType = getCampo(row, ["Issue Type", "Issue Type "]);
    const servico = getCampo(row, ["Service", "Serviço", "Servico"]);
    const status = getCampo(row, ["Status"]);
    const severidade = getCampo(row, ["Severity", "Severidade"]);
    const contato = getCampo(row, ["Primary Contact", "Contato Primário", "Contato Primario"]);
    const escalation = getCampo(row, ["Escalation Status"]);
    const milestone = getCampo(row, ["Milestone"]);
    const resourceUrl = getCampo(row, ["Resource Url", "Resource URL"]);

    const createdRaw = getCampo(row, ["Created", "Criado_dt"]);
    const updatedRaw = getCampo(row, ["Updated", "Atualizado_dt"]);
    const closedRaw = getCampo(row, ["Closed"]);
    const milestoneRaw = getCampo(row, ["Milestone Date"]);

    const criado = parseDataFlex(createdRaw);
    const atualizado = parseDataFlex(updatedRaw);
    const fechadoEm = parseDataFlex(closedRaw);
    const milestoneDate = parseDataFlex(milestoneRaw);
    const fechado = isFechado(status, closedRaw);
    const agora = new Date();
    const dataReferencia = fechado ? (fechadoEm || atualizado || agora) : agora;

    let situacao = "Sem milestone";
    let diasParaVencer = null;

    if (milestoneDate) {
      const vencido = dataReferencia.getTime() > milestoneDate.getTime();
      diasParaVencer = Math.ceil((milestoneDate.getTime() - agora.getTime()) / 86400000);

      if (vencido) {
        situacao = "Fora do SLA";
      } else if (!fechado && diasParaVencer <= 2) {
        situacao = "Em risco";
      } else {
        situacao = "Dentro do SLA";
      }
    }

    const diasVida = criado ? diffDias(criado, dataReferencia) : null;

    return {
      sr, resumo, issueType, servico, status, severidade, contato, escalation,
      milestone, resourceUrl,
      createdRaw, updatedRaw, closedRaw, milestoneRaw,
      criado, atualizado, fechadoEm, milestoneDate, fechado,
      dataReferencia, diasVida, diasParaVencer, situacao
    };
  }

  function contar(lista, pred) {
    return (lista || []).filter(pred).length;
  }

  function setText(id, valor) {
    const el = $(id);
    if (el) el.textContent = String(valor);
  }

  function classeSla(s) {
    if (s === "Dentro do SLA") return "sla-ok";
    if (s === "Em risco") return "sla-risco";
    if (s === "Fora do SLA") return "sla-fora";
    return "sla-sem";
  }

  function contarPor(lista, campoFn) {
    const m = {};
    (lista || []).forEach(x => {
      const k = campoFn(x) || "Não informado";
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }

  function atualizarKPIs(lista) {
    const total = lista.length;
    const comMilestone = contar(lista, x => !!x.milestoneDate);
    const dentro = contar(lista, x => x.situacao === "Dentro do SLA");
    const risco = contar(lista, x => x.situacao === "Em risco");
    const fora = contar(lista, x => x.situacao === "Fora do SLA");
    const sem = contar(lista, x => x.situacao === "Sem milestone");
    const pct = comMilestone ? ((dentro / comMilestone) * 100).toFixed(1) + "%" : "-";

    setText("kpiTotal", total);
    setText("kpiDentro", dentro);
    setText("kpiRisco", risco);
    setText("kpiFora", fora);
    setText("kpiSemMilestone", sem);
    setText("kpiCumprimento", pct);
  }

  function baseOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: PLUMA.verdeEscuro } },
        datalabels: {
          display: true,
          color: "#111",
          anchor: "end",
          align: "top",
          font: { weight: "bold", size: 10 },
          formatter: v => v > 0 ? v : ""
        }
      },
      ...extra
    };
  }

  function atualizarGraficos(lista) {
    const porMes = {
      "Dentro do SLA": Array(12).fill(0),
      "Em risco": Array(12).fill(0),
      "Fora do SLA": Array(12).fill(0),
      "Sem milestone": Array(12).fill(0)
    };

    lista.forEach(x => {
      const dt = x.criado || x.atualizado || x.milestoneDate;
      if (dt) porMes[x.situacao][dt.getMonth()]++;
    });

    chartMes?.destroy();
    chartMes = new Chart($("graficoSlaMes"), {
      type: "bar",
      data: {
        labels: MESES,
        datasets: [
          { label: "Dentro", data: porMes["Dentro do SLA"], backgroundColor: PLUMA.verdeMedio, borderRadius: 5 },
          { label: "Em risco", data: porMes["Em risco"], backgroundColor: PLUMA.amarelo, borderRadius: 5 },
          { label: "Fora", data: porMes["Fora do SLA"], backgroundColor: PLUMA.vermelho, borderRadius: 5 },
          { label: "Sem milestone", data: porMes["Sem milestone"], backgroundColor: PLUMA.cinza, borderRadius: 5 }
        ]
      },
      options: baseOptions({ scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } })
    });

    const sevMap = contarPor(lista, x => x.severidade);
    chartSev?.destroy();
    chartSev = new Chart($("graficoSlaSeveridade"), {
      type: "bar",
      data: {
        labels: Object.keys(sevMap).map(x => window.PLUMA_TRADUCAO?.traduzir(x) || x),
        datasets: [{ label: "SRs", data: Object.values(sevMap), backgroundColor: PLUMA.verdeEscuro, borderRadius: 5 }]
      },
      options: baseOptions({ plugins: { legend: { display: false }, datalabels: { display: true, anchor: "end", align: "top" } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } })
    });

    const fora = lista.filter(x => x.situacao === "Fora do SLA");
    const servMap = contarPor(fora, x => x.servico);
    const topServ = Object.entries(servMap).sort((a,b) => b[1] - a[1]).slice(0, 10);
    chartServico?.destroy();
    chartServico = new Chart($("graficoSlaServico"), {
      type: "bar",
      data: {
        labels: topServ.map(x => window.PLUMA_TRADUCAO?.traduzir(x[0]) || x[0]),
        datasets: [{ label: "Fora do SLA", data: topServ.map(x => x[1]), backgroundColor: PLUMA.vermelho, borderRadius: 5 }]
      },
      options: baseOptions({ indexAxis: "y", plugins: { legend: { display: false }, datalabels: { display: true, anchor: "end", align: "right" } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } })
    });
  }

  function valorOrdenacao(x, campo) {
    const pesoSla = { "Fora do SLA": 1, "Em risco": 2, "Dentro do SLA": 3, "Sem milestone": 4 };
    const mapa = {
      sr: x.sr,
      servico: x.servico,
      severidade: x.severidade,
      status: x.status,
      criado: x.criado,
      fechado: x.fechadoEm,
      milestone: x.milestone,
      milestoneDate: x.milestoneDate,
      dias: x.diasVida,
      sla: pesoSla[x.situacao] || 9,
      contato: x.contato
    };
    return mapa[campo];
  }

  function compararValores(a, b, campo, direcao) {
    const va = valorOrdenacao(a, campo);
    const vb = valorOrdenacao(b, campo);
    const mult = direcao === "desc" ? -1 : 1;

    // Nulos/vazios ficam sempre no fim, independente da direção
    const vazioA = va === null || va === undefined || va === "";
    const vazioB = vb === null || vb === undefined || vb === "";
    if (vazioA && vazioB) return 0;
    if (vazioA) return 1;
    if (vazioB) return -1;

    if (va instanceof Date || vb instanceof Date) {
      const ta = va instanceof Date && !isNaN(va) ? va.getTime() : 0;
      const tb = vb instanceof Date && !isNaN(vb) ? vb.getTime() : 0;
      return (ta - tb) * mult;
    }

    if (typeof va === "number" || typeof vb === "number") {
      return ((Number(va) || 0) - (Number(vb) || 0)) * mult;
    }

    return String(va).localeCompare(String(vb), "pt-BR", { numeric: true, sensitivity: "base" }) * mult;
  }

  function obterLinhasOrdenadas(lista) {
    const ordenados = [...(lista || [])];

    if (!ordenacaoTabela.campo) {
      const peso = { "Fora do SLA": 1, "Em risco": 2, "Dentro do SLA": 3, "Sem milestone": 4 };
      return ordenados.sort((a, b) => (peso[a.situacao] || 9) - (peso[b.situacao] || 9));
    }

    return ordenados.sort((a, b) => compararValores(a, b, ordenacaoTabela.campo, ordenacaoTabela.direcao));
  }

  function atualizarIndicadoresOrdenacao() {
    const ths = document.querySelectorAll("#tabelaSla")?.[0]?.closest("table")?.querySelectorAll("thead th") || [];
    ths.forEach(th => {
      const label = th.dataset.labelOriginal || th.textContent.replace(/[↕↑↓]/g, "").trim();
      th.dataset.labelOriginal = label;
      const campo = th.dataset.sortCampo;
      const ativo = campo && campo === ordenacaoTabela.campo;
      const icone = !campo ? "" : (ativo ? (ordenacaoTabela.direcao === "asc" ? " ↑" : " ↓") : " ↕");
      th.textContent = `${label}${icone}`;
    });
  }

  function configurarOrdenacaoTabela() {
    const tabela = $("tabelaSla")?.closest("table");
    if (!tabela) return;

    const campos = ["sr", "servico", "severidade", "status", "criado", "fechado", "milestone", "milestoneDate", "dias", "sla", "contato"];
    const ths = tabela.querySelectorAll("thead th");

    ths.forEach((th, idx) => {
      if (th.dataset.sortConfigurado === "1") return;
      const campo = campos[idx];
      if (!campo) return;

      th.dataset.sortConfigurado = "1";
      th.dataset.sortCampo = campo;
      th.dataset.labelOriginal = th.textContent.trim();
      th.style.cursor = "pointer";
      th.title = "Clique para ordenar crescente/decrescente";

      th.addEventListener("click", () => {
        if (ordenacaoTabela.campo === campo) {
          ordenacaoTabela.direcao = ordenacaoTabela.direcao === "asc" ? "desc" : "asc";
        } else {
          ordenacaoTabela.campo = campo;
          ordenacaoTabela.direcao = campo === "dias" || campo === "criado" || campo === "fechado" || campo === "milestoneDate" ? "desc" : "asc";
        }
        atualizarTabela(linhasSla);
      });
    });

    atualizarIndicadoresOrdenacao();
  }

  function atualizarTabela(lista) {
    const tbody = $("tabelaSla");
    if (!tbody) return;
    configurarOrdenacaoTabela();
    tbody.innerHTML = "";

    const ordenados = obterLinhasOrdenadas(lista);

    ordenados.forEach(x => {
      const tr = document.createElement("tr");
      const numeroSr = x.sr || "-";
      tr.innerHTML = `
        <td>${numeroSr}</td>
        <td title="${x.servico || ""}">${x.servico || "-"}</td>
        <td>${x.severidade || "-"}</td>
        <td>${x.status || "-"}</td>
        <td>${fmtData(x.criado) || x.createdRaw || "-"}</td>
        <td>${fmtData(x.fechadoEm) || x.closedRaw || ""}</td>
        <td>${x.milestone || "-"}</td>
        <td>${fmtData(x.milestoneDate) || x.milestoneRaw || "-"}</td>
        <td>${x.diasVida ?? "-"}</td>
        <td><span class="sla-pill ${classeSla(x.situacao)}">${x.situacao}</span></td>
        <td title="${x.contato || ""}">${x.contato || "-"}</td>
      `;
      tbody.appendChild(tr);
    });

    atualizarIndicadoresOrdenacao();
  }

  function atualizarAtualizacao(dados) {
    if (!atualizadoEm) return;

    const linhas = Array.isArray(dados) ? dados : [];
    const primeiraLinha = linhas[0] || {};

    const gruposPrioridade = [
      ["Gerado em", "Gerado_em", "Generated On", "Generated", "Exported On", "Exported"],
      ["Atualizado em", "Atualizado_em"],
      ["Updated", "Atualizado_dt", "Last Updated", "Last Update Date"]
    ];

    let coluna = null;
    for (const grupo of gruposPrioridade) {
      coluna = getColunaExistente(primeiraLinha, grupo);
      if (coluna) break;
    }

    if (!coluna) {
      atualizadoEm.textContent = "-";
      return;
    }

    let melhorValor = "";
    let melhorData = null;

    linhas.forEach(r => {
      const valor = String(r[coluna] || "").trim();
      if (!valor) return;

      const data = parseDataFlex(valor);
      if (data && !isNaN(data)) {
        if (!melhorData || data.getTime() > melhorData.getTime()) {
          melhorData = data;
          melhorValor = valor;
        }
      } else if (!melhorValor) {
        melhorValor = valor;
      }
    });

    atualizadoEm.textContent = melhorValor || "-";

    if (melhorData) {
      window.__GERADO_EM_REF__ = melhorData.toISOString();
    } else if (melhorValor) {
      window.__GERADO_EM_REF__ = melhorValor;
    }
  }

  function render(dados, origem) {
    dadosBrutos = dados;
    linhasSla = dados.map(calcularLinhaSLA);

    atualizarAtualizacao(dados);
    atualizarKPIs(linhasSla);
    atualizarGraficos(linhasSla);
    atualizarTabela(linhasSla);

    if (fonteDados) fonteDados.textContent = origem || "CSV";
    const temMilestone = linhasSla.filter(x => x.milestoneDate).length;
    const semMilestone = linhasSla.length - temMilestone;
    setStatus("success", `Dados SLA carregados ✅ Total: <b>${linhasSla.length}</b> • Com Milestone Date: <b>${temMilestone}</b> • Sem Milestone Date: <b>${semMilestone}</b>`);
    uploadBox?.classList.add("d-none");
  }

  async function carregar() {
    const ano = obterAnoPagina();
    const candidatos = [
      `dados/MOSSrSearchExport_${ano}.csv`,
      `dados/MOSSrSearchExport.csv`,
      `dados/dados_sr_${ano}.csv`,
      `dados/dados_sr.csv`
    ];

    for (const arq of candidatos) {
      try {
        setStatus("info", `Carregando SLA... tentando <b>${arq}</b>`);
        const resp = await fetch(arq, { cache: "no-store" });
        if (!resp.ok) continue;
        const texto = await resp.text();
        const dados = parseCSV(texto);
        if (dados.length) {
          render(dados, arq);
          return;
        }
      } catch (_) {}
    }

    setStatus("warning", `Não encontrei CSV de SLA automaticamente. Envie <b>MOSSrSearchExport_${ano}.csv</b> pelo campo abaixo.`);
    uploadBox?.classList.remove("d-none");
  }

  fileInput?.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const texto = await file.text();
    render(parseCSV(texto), file.name);
  });

  window.addEventListener("error", (e) => {
    setStatus("danger", `Erro no JavaScript: <b>${e.message || "desconhecido"}</b>`);
    uploadBox?.classList.remove("d-none");
  });

  carregar();
})();
