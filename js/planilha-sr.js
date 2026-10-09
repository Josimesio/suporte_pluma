(function () {
  "use strict";
  const section = document.getElementById("srWorkbook");
  if (!section) return;
  const $ = id => document.getElementById(id);
  const text = value => String(value ?? "");
  let source, rows = [], drafts = {}, page = 1, editor = false;
  const newRows = new Map();
  const srKey = value => text(value).trim().replace(/\s+/g, "").toUpperCase();
  const allRows = () => [...rows, ...[...newRows.values()].filter(row => Object.hasOwn(drafts, row.id))];
  const findRow = id => rows.find(row => row.id === id) || newRows.get(id);
  function canCreate(year) {
    const profile = window.perfilAtual?.();
    return editor && cloudReady && window.usuarioPodeEditarPlanilhas?.() &&
      (window.usuarioPodeVisualizarAba?.("consolidado") || window.usuarioPodeVisualizarAba?.("sr")) &&
      (profile?.perfil === "administrador" || profile?.permissoes?.[`chamados_${Number(year)}`] === true);
  }
  function prepareNew(call, year) {
    if (!source || !canCreate(year)) return null;
    const sr = srKey(call["Número SR"]), id = `portal:${Number(year)}:${sr}`;
    if (!sr || ![2025, 2026].includes(Number(year))) return null;
    const existing = rows.find(row => srKey(row.values[2]) === sr);
    if (existing) return existing;
    if (!newRows.has(id)) {
      const values = Array(25).fill(null); values[2] = sr;
      newRows.set(id, { id, values, isNew: true, year: Number(year), sourceRevision: source.revision, agingFormula: false });
    }
    return newRows.get(id);
  }
  let loading, storageKey, lastSaved = "", cloudReady = false, busy = false, legacy = {};
  let historyRow, historyPage = 0, historyTicket = 0;
  const formatDate = value => value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
  const longFields = new Set([7, 10, 17, 18, 19, 20, 21, 22, 23, 24]);
  // SR e resumo abrem a tela; a exportação mantém a ordem das colunas do Excel.
  const columns = [2, 7, ...Array.from({ length: 25 }, (_, i) => i).filter(i => i !== 2 && i !== 7)];
  const countDrafts = () => Object.keys(drafts).length;
  function message(value, kind = "info") {
    const box = $("srWorkbookStatus");
    box.hidden = !value;
    box.className = `sr-sheet-status alert alert-${kind} py-2`;
    box.textContent = value;
  }
  function cell(row, index) {
    const changes = drafts[row.id] || {};
    const value = Object.hasOwn(changes, index) ? changes[index] : row.values[index];
    if (index !== 9 || !row.agingFormula) return value;
    const match = text(cell(row, 1)).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
    if (!match) return null;
    const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const today = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return (Date.UTC(+today.year, +today.month - 1, +today.day) - Date.UTC(+match[3], +match[2] - 1, +match[1], +(match[4] || 0), +(match[5] || 0))) / 86400000;
  }
  function display(row, index) {
    const value = cell(row, index);
    return index === 9 && typeof value === "number" ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : text(value);
  }
  function filtered() {
    const query = $("srWorkbookSearch").value.trim().toLocaleLowerCase("pt-BR");
    const product = $("srWorkbookProduct").value, status = $("srWorkbookSubstatus").value;
    return allRows().filter(row => (!product || text(cell(row, 8)) === product) && (!status || text(cell(row, 4)) === status) &&
      (!query || source.headers.some((_, i) => display(row, i).toLocaleLowerCase("pt-BR").includes(query))));
  }
  function controls() {
    $("srWorkbookSave").disabled = busy || !cloudReady || !editor || !countDrafts();
    $("srWorkbookDiscard").disabled = busy || !countDrafts();
    $("srWorkbookExport").disabled = busy || !rows.length;
    $("srWorkbookReload").disabled = busy;
    $("srWorkbookLegacy").hidden = !editor || !Object.keys(legacy).length;
    $("srWorkbookLegacy").disabled = busy || !cloudReady;
    $("srWorkbookPending").textContent = countDrafts() ? `${countDrafts()} linha(s) com alterações não salvas` : "Nenhuma alteração pendente";
    $("srWorkbookPending").classList.toggle("sr-sheet-pending", !!countDrafts());
  }
  function versionTools(row, container) {
    if (!row?.dbId) return;
    const tools = document.createElement("span"); tools.className = "sr-version-tools";
    const badge = document.createElement("small"); badge.textContent = `v${row.version}`;
    const button = document.createElement("button"); button.type = "button"; button.className = "sr-history-button";
    button.textContent = "Histórico"; button.disabled = busy;
    button.setAttribute("aria-label", `Histórico da SR ${text(row.values[2]).trim()}, linha ${row.id}`);
    button.addEventListener("click", () => showHistory(row));
    tools.append(badge, button); container.append(tools);
    const author = document.createElement("small"); author.className = "sr-save-author";
    author.textContent = `Salvo por: ${row.savedName || row.savedEmail || (row.version === 1 ? "Carga inicial" : "Autor não registrado")}`;
    author.title = `Salvo em ${formatDate(row.updatedAt)} (Brasília)`;
    container.append(author);
  }
  function createCell(row, i) {
    const td = document.createElement("td");
    if (i === 2) {
      td.textContent = text(row.values[i]).trim();
      td.title = `Linha ${row.id} da aba SRs`;
      window.PlumaCelulas.anexar(td, { fonte: "sr", linha: row.dbId, linhaLabel: row.id, coluna: "2", label: source.headers[2], numero_sr: text(row.values[2]).trim(), aba: window.PlumaAbas.atual() === "consolidado" ? "consolidado" : "sr" }, row.cellVersions);
      return td;
    }
    const input = document.createElement(longFields.has(i) ? "textarea" : "input");
    if (input.tagName === "INPUT") input.type = "text";
    input.value = display(row, i); input.dataset.column = i; input.dataset.rowId = row.id;
    input.readOnly = !editor || !cloudReady || busy || (row.isNew && !canCreate(row.year)) || (i === 9 && row.agingFormula);
    if (row.isNew) { input.placeholder = "Preencher"; td.classList.add("sr-cell-new"); }
    input.setAttribute("aria-label", `${source.headers[i]}, SR ${text(row.values[2]).trim()}, linha ${row.id}`);
    if ([4, 5, 8, 11, 14, 15, 16, 21, 24].includes(i)) input.setAttribute("list", `srWorkbookOptions-${i}`);
    if (i === 9) { td.classList.add("sr-numeric"); input.title = row.agingFormula ? "Dias desde Creation Date, calculados automaticamente." : "Aging informado na planilha."; }
    td.classList.toggle("sr-cell-changed", Object.hasOwn(drafts[row.id] || {}, i));
    td.append(input);
    window.PlumaCelulas.anexar(td, { fonte: "sr", linha: row.dbId, linhaLabel: row.id, coluna: String(i), label: source.headers[i], numero_sr: text(row.values[2]).trim(), aba: window.PlumaAbas.atual() === "consolidado" ? "consolidado" : "sr" }, row.cellVersions);
    return td;
  }
  function render() {
    if (!source) return;
    const list = filtered();
    const size = $("srWorkbookPageSize").value === "all" ? Math.max(list.length, 1) : Number($("srWorkbookPageSize").value);
    const pages = Math.max(1, Math.ceil(list.length / size));
    page = Math.min(Math.max(page, 1), pages);
    const start = (page - 1) * size, body = $("srWorkbookBody");
    body.replaceChildren();
    for (const row of list.slice(start, start + size)) {
      const tr = document.createElement("tr"); tr.dataset.rowId = row.id;
      for (const i of columns) {
        tr.append(createCell(row, i));
      }
      body.append(tr);
    }
    if (!list.length) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = columns.length; td.className = "sr-empty"; td.textContent = "Nenhuma SR encontrada."; tr.append(td); body.append(tr);
    }
    $("srWorkbookCount").textContent = `${list.length} de ${allRows().length} registros`;
    $("srWorkbookRange").textContent = list.length ? `${start + 1}–${Math.min(start + size, list.length)} de ${list.length}` : "0 registros";
    $("srWorkbookPageLabel").textContent = `Página ${page} de ${pages}`;
    $("srWorkbookPrev").disabled = page === 1; $("srWorkbookNext").disabled = page === pages;
    controls();
  }
  function options() {
    const targets = [[8, "srWorkbookProduct"], [4, "srWorkbookSubstatus"]];
    for (const [index, id] of targets) {
      const select = $(id), previous = select.value;
      select.replaceChildren(new Option("Todos", ""));
      const values = [...new Set(rows.map(row => text(cell(row, index))).filter(Boolean))].sort();
      for (const value of values) select.add(new Option(value, value));
      select.value = values.includes(previous) ? previous : "";
    }
    for (const index of [4, 5, 8, 11, 14, 15, 16, 21, 24]) {
      const list = $(`srWorkbookOptions-${index}`); list.replaceChildren();
      for (const value of [...new Set(rows.map(row => text(cell(row, index))).filter(Boolean))].sort()) {
        const option = document.createElement("option"); option.value = value; list.append(option);
      }
    }
  }
  async function load(force = false) {
    const aba = window.PlumaAbas.atual() === "consolidado" ? "consolidado" : "sr";
    if (!await window.PlumaAbas.permitir(aba)) return;
    if (busy && !loading) return;
    if (loading) return loading;
    if (source && !force) return;
    loading = (async () => {
      busy = true; controls();
      message("Carregando a SR compartilhada...");
      try {
        await window.plumaAuthPronto;
        const response = await fetch("dados/planilha-sr.json?v=20261008-sr-1", { cache: "no-store" });
        if (!response.ok) throw new Error("Arquivo de dados não encontrado.");
        const data = await response.json();
        if (data.headers?.length !== 25 || !Array.isArray(data.rows)) throw new Error("Estrutura da planilha inválida.");
        storageKey = `pluma:sr-workbook:${data.revision}:${window.usuarioAtual?.() || "consulta"}`;
        let local = {};
        try { local = JSON.parse(localStorage.getItem(storageKey) || "{}"); }
        catch { /* O salvamento compartilhado independe do armazenamento local. */ }
        legacy = local.changes && typeof local.changes === "object" ? local.changes : {};
        source = data;
        $("srWorkbookHead").replaceChildren(...columns.map(i => {
          const th = document.createElement("th"); th.scope = "col"; th.textContent = source.headers[i]; return th;
        }));
        const records = await window.PlumaSRBanco.carregar(data.revision);
        const byId = new Map(records.map(record => [record.linha_origem, record]));
        if (data.rows.some(row => !byId.has(row.id))) throw new Error("A carga da SR está incompleta ou seu perfil não permite consultá-la. Confira a instalação v10 e suas permissões.");
        const loadedRows = data.rows.map(row => {
          const record = byId.get(row.id);
          if (!Array.isArray(record.valores) || record.valores.length !== 25) throw new Error("Registro com estrutura inválida no banco.");
          return { ...row, values: [...record.valores], dbId: record.id, version: record.versao,
            agingFormula: record.aging_calculado, updatedAt: record.atualizado_em,
            savedName: record.atualizado_nome, savedEmail: record.atualizado_email, cellVersions: record.versoes_celulas };
        });
        const originalIds = new Set(data.rows.map(row => row.id));
        for (const record of records.filter(record => !originalIds.has(record.linha_origem))) {
          if (!Array.isArray(record.valores) || record.valores.length !== 25) throw new Error("Registro com estrutura inválida no banco.");
          loadedRows.push({ id: record.linha_origem, values: [...record.valores], dbId: record.id, version: record.versao,
            agingFormula: record.aging_calculado, updatedAt: record.atualizado_em,
            savedName: record.atualizado_nome, savedEmail: record.atualizado_email, cellVersions: record.versoes_celulas });
        }
        for (const row of loadedRows) newRows.delete(row.id);
        rows = loadedRows; cloudReady = true; editor = !!window.usuarioPodeEditarPlanilhas?.();
        lastSaved = rows.map(row => row.updatedAt).sort().at(-1) || "";
        $("srWorkbookSync").textContent = lastSaved ? `SR no Supabase • última alteração: ${formatDate(lastSaved)}` : "SR no Supabase";
        $("srWorkbookHelp").textContent = editor ? "Administrador e Gestor podem editar e salvar. Cada salvamento registra autor, data e campos alterados. SR Number permanece fixo; Aging é calculado quando há fórmula na origem." : "Consulta e exportação disponíveis. Somente Administrador e Gestor podem editar e salvar.";
        options(); render();
        message(force && countDrafts() ? "Dados recarregados. Seus rascunhos foram preservados; revise-os comparando com o histórico antes de salvar." : "");
        if (force) void window.PlumaAbas.registrar(aba, "recarregamento", { quantidade: rows.length });
      } catch (error) {
        void window.PlumaAbas.registrar(aba, "erro", { detalhes: { tipo: "carregamento" } });
        cloudReady = false; editor = false;
        // A carga estática não substitui uma leitura autorizada pelo banco.
        $("srWorkbookSync").textContent = "SR sem conexão ao banco • somente consulta";
        $("srWorkbookHelp").textContent = "Recarregue a SR após conferir a instalação e suas permissões no Supabase.";
        message(`Não foi possível consultar a SR no Supabase: ${error.message} Os dados exibidos ficam somente para consulta; nenhum salvamento local substitui a gravação no banco.`, "danger");
      }
      finally {
        busy = false; loading = undefined; render();
        window.dispatchEvent(new CustomEvent("pluma:sr-alterada", { detail: { action: "reload" } }));
      }
    })();
    return loading;
  }
  async function save() {
    const aba = window.PlumaAbas.atual() === "consolidado" ? "consolidado" : "sr";
    if (!await window.PlumaAbas.permitir(aba)) return false;
    editor = !!window.usuarioPodeEditarPlanilhas();
    if (busy || !cloudReady || !editor || !countDrafts()) return false;
    busy = true; render();
    window.dispatchEvent(new CustomEvent("pluma:sr-alterada", { detail: { action: "busy" } }));
    const pending = Object.entries(drafts), failures = [];
    let savedCount = 0;
    for (let i = 0; i < pending.length; i++) {
      const [id, changes] = pending[i], row = findRow(id);
      message(`Salvando SR ${i + 1} de ${pending.length} e registrando a versão...`);
      try {
        const result = row?.isNew ? await window.PlumaSRBanco.criar(row, changes, aba) :
          await window.PlumaSRBanco.salvar(row, changes, aba);
        row.values = [...result.valores]; row.version = result.versao; row.updatedAt = result.atualizado_em;
        row.savedName = result.atualizado_nome; row.savedEmail = result.atualizado_email;
        row.cellVersions = result.versoes_celulas;
        row.dbId = result.id;
        if (row.isNew) { row.isNew = false; rows.push(row); newRows.delete(id); }
        delete drafts[id]; lastSaved = result.atualizado_em; savedCount++;
      } catch (error) { failures.push(`SR ${text(row?.values[2]).trim()}, linha ${id}: ${error.message}`); void window.PlumaAbas.registrar(aba, "erro", { referencia: text(row?.values[2]).trim(), detalhes: { tipo: "salvamento" } }); }
    }
    busy = false; options(); render();
    $("srWorkbookSync").textContent = `SR no Supabase • última alteração: ${formatDate(lastSaved)}`;
    message(failures.length ? `${savedCount} linha(s) salva(s). As edições que falharam continuam pendentes. ${failures.join(" | ")}` : `${savedCount} linha(s) salva(s) no Supabase com histórico de versões.`, failures.length ? "danger" : "success");
    window.dispatchEvent(new CustomEvent("pluma:sr-alterada", { detail: { action: "save", success: !failures.length, savedCount, failures } }));
    return !failures.length;
  }
  async function exportExcel() {
    if (!await window.PlumaAbas.permitir("sr")) return;
    if (!source) return;
    $("srWorkbookExport").disabled = true;
    try {
      const list = filtered();
      const pendingExport = list.filter(row => Object.hasOwn(drafts, row.id)).length;
      const matrix = list.map(row => source.headers.map((_, i) => text(cell(row, i))));
      const summary = [["Origem", "Srs_Oracle.xlsx / SRs"], ["Registros", String(list.length)], ["Busca", $("srWorkbookSearch").value], ["Product", $("srWorkbookProduct").value || "Todos"], ["Substatus", $("srWorkbookSubstatus").value || "Todos"], ["Edições pendentes incluídas", String(pendingExport)]];
      const blob = await window.PlumaExportacaoExcel.gerarExcel(source.headers, matrix, summary, "SR");
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = "SR_atualizada.xlsx"; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      void window.PlumaAbas.registrar("sr", "exportacao", { quantidade: list.length, detalhes: { pendentes: pendingExport } });
      message(`Excel baixado com ${list.length} registros e os 25 campos da SR, incluindo as edições desta tela.`, "success");
    } catch (error) { message(`Não foi possível baixar o Excel: ${error.message}`, "danger"); void window.PlumaAbas.registrar("sr", "erro", { detalhes: { tipo: "exportacao" } }); }
    finally { controls(); }
  }
  function editCell(event) {
    const input = event.target, i = Number(input.dataset.column), id = input.dataset.rowId;
    if (!editor || !cloudReady || busy || !id || i === 2) return;
    const row = findRow(id);
    if (!row || (i === 9 && row.agingFormula)) return;
    if (row.isNew && !canCreate(row.year)) return;
    const fields = drafts[id] || {};
    if (input.value === display({ ...row, id: "original" }, i)) delete fields[i]; else fields[i] = input.value;
    if (Object.keys(fields).length) drafts[id] = fields; else delete drafts[id];
    input.closest("td").classList.toggle("sr-cell-changed", Object.hasOwn(fields, i)); controls();
    if (i === 1 && row.agingFormula) {
      const aging = input.closest("tr").querySelector('[data-column="9"]');
      if (aging) aging.value = display(row, 9);
    }
    window.dispatchEvent(new CustomEvent("pluma:sr-alterada", { detail: { action: "input", id, column: i } }));
  }
  $("srWorkbookBody").addEventListener("input", editCell);
  for (const id of ["srWorkbookSearch", "srWorkbookProduct", "srWorkbookSubstatus", "srWorkbookPageSize"]) {
    $(id).addEventListener(id === "srWorkbookSearch" ? "input" : "change", () => { page = 1; render(); });
  }
  $("srWorkbookPrev").addEventListener("click", () => { page--; render(); });
  $("srWorkbookNext").addEventListener("click", () => { page++; render(); });
  $("srWorkbookSave").addEventListener("click", save);
  $("srWorkbookReload").addEventListener("click", () => load(true));
  $("srWorkbookLegacy").addEventListener("click", () => {
    if (busy || !cloudReady || !editor) return;
    for (const row of rows) for (const [index, value] of Object.entries(legacy[row.id] || {})) {
      const i = Number(index);
      if (!Number.isInteger(i) || i < 0 || i > 24 || i === 2 || (i === 9 && row.agingFormula)) continue;
      if (text(value) !== text(row.values[i]) && !Object.hasOwn(drafts[row.id] || {}, i)) {
        drafts[row.id] = { ...(drafts[row.id] || {}), [i]: text(value) };
      }
    }
    legacy = {}; render();
    message("Edições deste navegador trazidas como rascunhos. Confira os valores e clique em Salvar no Supabase para criar suas versões.", "warning");
    window.dispatchEvent(new CustomEvent("pluma:sr-alterada", { detail: { action: "legacy" } }));
  });
  $("srWorkbookExport").addEventListener("click", exportExcel);
  async function showHistory(row) {
    const aba = window.PlumaAbas.atual() === "consolidado" ? "consolidado" : "sr";
    if (!await window.PlumaAbas.permitir(aba)) return;
    void window.PlumaAbas.registrar(aba, "historico", { referencia: text(row.values[2]).trim() });
    historyRow = row; historyPage = 0;
    $("srVersionTitle").textContent = `Histórico da SR ${text(row.values[2]).trim()} • linha ${row.id}`;
    if (!$("srVersionDialog").open) $("srVersionDialog").showModal();
    await loadHistory();
  }
  async function showCallHistory(row, fields) {
    if (!await window.PlumaAbas.permitir("planilha", row.ano)) return;
    void window.PlumaAbas.registrar("planilha", "historico", { ano: row.ano, referencia: row.numero_sr });
    historyRow = { kind: "chamado", ano: row.ano, numero_sr: row.numero_sr, fields };
    historyPage = 0;
    $("srVersionTitle").textContent = `Histórico do chamado ${row.numero_sr} • ${row.ano}`;
    if (!$("srVersionDialog").open) $("srVersionDialog").showModal();
    await loadHistory();
  }
  async function showCommentHistory(ano, numero_sr) {
    if (!await window.PlumaAbas.permitir("consolidado", ano)) return;
    void window.PlumaAbas.registrar("consolidado", "historico", { ano, referencia: numero_sr, detalhes: { tipo: "comentarios_consolidado" } });
    historyRow = { kind: "comentarios", ano, numero_sr, fields: window.PlumaComentariosConsolidado.fields };
    historyPage = 0;
    $("srVersionTitle").textContent = `Histórico dos comentários • SR ${numero_sr} • ${ano}`;
    if (!$("srVersionDialog").open) $("srVersionDialog").showModal();
    await loadHistory();
  }
  async function loadHistory() {
    const ticket = ++historyTicket;
    $("srVersionStatus").textContent = "Carregando versões...";
    $("srVersionBody").replaceChildren(); $("srVersionPrev").disabled = true; $("srVersionNext").disabled = true;
    try {
      if (historyRow.kind === "celula") {
        const list = await window.PlumaCelulas.historico(historyRow, historyPage * 20);
        if (ticket !== historyTicket) return;
        window.PlumaCelulas.renderizarHistorico(list, $("srVersionBody"));
        $("srVersionStatus").textContent = `Página ${historyPage + 1} • ${list.length} versão(ões) desta coluna nesta linha. Origem e arquivo identificam as cargas da planilha.`;
        $("srVersionPrev").disabled = historyPage === 0; $("srVersionNext").disabled = list.length < 20;
        return;
      }
      const isComment = historyRow.kind === "comentarios", isCall = historyRow.kind === "chamado", isObject = isCall || isComment;
      const list = isComment ? await window.PlumaComentariosConsolidado.historico(historyRow.ano, historyRow.numero_sr, historyPage * 20) :
        isCall ? await window.PlumaDadosOracle.historico(historyRow.ano, historyRow.numero_sr, historyPage * 20) :
        await window.PlumaSRBanco.historico(historyRow.dbId, historyPage * 20);
      const fieldLabel = change => isObject ? historyRow.fields.find(([key]) => key === change.campo)?.[1] || change.campo : source.headers[change.coluna];
      if (ticket !== historyTicket) return;
      for (const version of list) {
        const card = document.createElement("article"); card.className = "sr-version-card";
        const title = document.createElement("h3"); title.textContent = `Versão ${version.versao} • ${version.acao === "carga_inicial" ? "Carga inicial" : version.versao === 1 ? "Cadastro" : "Edição"}`;
        const author = version.usuario_nome || version.usuario_email || "Carga inicial via SQL";
        const meta = document.createElement("p"); meta.textContent = `Salvo em ${formatDate(version.alterado_em)} (Brasília) • Salvo por: ${author}${version.usuario_nome && version.usuario_email ? ` (${version.usuario_email})` : ""}`;
        card.append(title, meta);
        if (version.alteracoes?.length) {
          const table = document.createElement("table"); table.className = "sr-version-diff sr-version-changes";
          const head = table.createTHead().insertRow();
          for (const label of ["Campo", "Antes — data e hora", "Depois — data e hora", "Alterado por"]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = label; head.append(th); }
          const body = table.createTBody();
          for (const change of version.alteracoes) {
            const tr = body.insertRow();
            const changedBy = change.usuario_nome || change.usuario_email || author;
            for (const [index, value] of [fieldLabel(change), change.anterior, change.novo, changedBy].entries()) {
              const td = tr.insertCell(); td.dataset.label = ["Campo", "Antes — data e hora", "Depois — data e hora", "Alterado por"][index];
              if (index === 1 || index === 2) {
                const timestamp = document.createElement("small"); timestamp.className = "sr-version-date";
                const date = index === 1 ? change.anterior_em : change.novo_em || version.alterado_em;
                timestamp.textContent = date ? `${formatDate(date)} (Brasília)` : "Data não registrada";
                const content = document.createElement("span"); content.textContent = typeof value === "object" && value !== null ? JSON.stringify(value) : text(value);
                content.dataset.srVersionValue = ""; td.append(timestamp, content);
              } else {
                td.textContent = text(value);
                if (index === 3 && change.usuario_nome && change.usuario_email) {
                  const email = document.createElement("small"); email.className = "sr-save-author"; email.textContent = change.usuario_email; td.append(email);
                }
              }
            }
          }
          card.append(table);
        }
        const detail = document.createElement("details"), summary = document.createElement("summary"); summary.textContent = "Ver todos os dados desta versão";
        const table = document.createElement("table"); table.className = "sr-version-diff";
        const snapshot = isObject ? Object.entries(version.depois || {}) : (version.valores || []).map((value, index) => [index, value]);
        snapshot.forEach(([key, value]) => {
          const tr = table.insertRow(), th = document.createElement("th"); th.textContent = isObject ? historyRow.fields.find(([field]) => field === key)?.[1] || key : source.headers[key]; th.scope = "row"; tr.append(th);
          const td = tr.insertCell(); td.textContent = typeof value === "object" && value !== null ? JSON.stringify(value) : text(value); td.dataset.srVersionValue = "";
        });
        detail.append(summary, table); card.append(detail); $("srVersionBody").append(card);
      }
      $("srVersionStatus").textContent = list.length ? `Página ${historyPage + 1} • ${list.length} versão(ões). Datas em Brasília; Antes indica quando o valor anterior daquele campo foi registrado.${isObject ? "" : " Aging mostra o valor armazenado."}` : "Nenhuma versão nesta página.";
      $("srVersionPrev").disabled = historyPage === 0; $("srVersionNext").disabled = list.length < 20;
    } catch (error) {
      if (ticket === historyTicket) { $("srVersionStatus").textContent = `Não foi possível consultar as versões: ${error.message}`; $("srVersionPrev").disabled = historyPage === 0; }
    }
  }
  $("srVersionClose").addEventListener("click", () => { historyTicket++; $("srVersionDialog").close(); });
  $("srVersionDialog").addEventListener("cancel", () => historyTicket++);
  $("srVersionPrev").addEventListener("click", () => { historyPage--; loadHistory(); });
  $("srVersionNext").addEventListener("click", () => { historyPage++; loadHistory(); });
  function discard(confirmed = false) {
    if (busy) return;
    if (countDrafts() && (confirmed === true || confirm("Descartar as alterações da SR que ainda não foram salvas?"))) {
      drafts = {}; newRows.clear(); render(); message("Alterações pendentes descartadas.");
      window.dispatchEvent(new CustomEvent("pluma:sr-alterada", { detail: { action: "discard" } }));
    }
  }
  $("srWorkbookDiscard").addEventListener("click", discard);
  window.addEventListener("beforeunload", event => { if (countDrafts()) { event.preventDefault(); event.returnValue = ""; } });
  section.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
  });
  window.PlumaSRWorkbook = {
    async abrir() { await load(); if (source) { options(); render(); } },
    snapshot() { return source ? { revision: source.revision, headers: source.headers, rows: allRows(), columns, editor, pending: countDrafts(), linhasPendentes: Object.keys(drafts), savedAt: lastSaved, busy, cloudReady } : null; },
    valor: cell, texto: display, criarCelula: createCell, editar: editCell,
    salvar: save, descartar: discard, recarregar: () => load(true), ferramentasVersao: versionTools, historicoChamado: showCallHistory,
    prepararNovo: prepareNew
  };
  window.PlumaSRWorkbook.historicoComentarios = showCommentHistory;
  window.PlumaSRWorkbook.historicoCelula = async context => {
    if (!await window.PlumaAbas.permitir(context.aba || "consolidado", context.ano)) return;
    historyRow = { ...context, kind: "celula" }; historyPage = 0;
    $("srVersionTitle").textContent = `${context.label} × SR ${context.numero_sr} • linha ${context.linhaLabel || context.linha}${context.ano ? ` • ${context.ano}` : ""}`;
    if (!$("srVersionDialog").open) $("srVersionDialog").showModal();
    void window.PlumaAbas.registrar(context.aba || "consolidado", "historico", { ano: context.ano, referencia: context.numero_sr, detalhes: { tipo: "coluna_linha", coluna: String(context.coluna), linha: context.linha } });
    await loadHistory();
  };
  $("srWorkbookOriginal").addEventListener("click", async event => {
    event.preventDefault();
    if (!await window.PlumaAbas.permitir("sr")) return;
    const link = document.createElement("a"); link.href = "dados/Srs_Oracle.xlsx"; link.download = "Srs_Oracle.xlsx";
    document.body.append(link); link.click(); link.remove();
    void window.PlumaAbas.registrar("sr", "exportacao_original");
  });
  window.addEventListener("pluma:permissoes-abas", () => {
    editor = !!window.usuarioPodeEditarPlanilhas();
    if (!busy) render();
  });
})();
