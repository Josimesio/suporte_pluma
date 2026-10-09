(function () {
  "use strict";
  const section = document.getElementById("srMerged");
  if (!section) return;
  const $ = id => document.getElementById(id);
  const host = document.querySelector("[data-planilha-oracle]");
  const multi = host.dataset.planilhaOracle === "multi";
  const listColumns = ["Número SR", "Serviço", "Issue Type", "Status", "Severidade", "Criado_dt", "Atualizado_dt", "Contato Primário"];
  const listFields = ["numero_sr", "servico", "issue_type", "status", "severidade", "criado_texto", "atualizado_texto", "contato_primario"];
  const text = v => String(v ?? "");
  const key = v => text(v).trim().replace(/\s+/g, "").toUpperCase();
  const active = () => host.classList.contains("sr-consolidated");
  let page = 1, year = Number(host.dataset.planilhaOracle) || 2026;
  let homeRows = [], entries = [], workbook, sheetColumns = [], loading = false, request = 0;
  let sort = { column: -1, direction: 1 };
  function message(value, kind = "info") {
    $("srMergedStatus").hidden = !value;
    $("srMergedStatus").className = `sr-sheet-status alert alert-${kind} py-2`;
    $("srMergedStatus").textContent = value;
  }
  function controls() {
    const state = window.PlumaSRWorkbook?.snapshot();
    $("srMergedSave").disabled = loading || state?.busy || !state?.cloudReady || !state?.editor || !state.pending;
    $("srMergedDiscard").disabled = loading || state?.busy || !state?.pending;
    $("srMergedExport").disabled = loading || state?.busy || !entries.length;
    $("srMergedReload").disabled = loading || state?.busy;
    $("srMergedYear").disabled = loading;
    $("srMergedPending").textContent = state?.pending ? `${state.pending} linha(s) da SR com alterações não salvas` : "Nenhuma alteração pendente";
    $("srMergedPending").classList.toggle("sr-sheet-pending", !!state?.pending);
    $("srMergedSync").textContent = state?.cloudReady ? `SR no Supabase • última alteração: ${new Date(state.savedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "SR sem conexão ao banco • somente consulta";
  }
  function homeOptions() {
    for (const [id, column] of [["srMergedService", "Serviço"], ["srMergedListStatus", "Status"], ["srMergedSeverity", "Severidade"]]) {
      const select = $(id), previous = select.value;
      select.replaceChildren(new Option("Todos", ""));
      const values = [...new Set(homeRows.map(row => text(row[column])).filter(Boolean))].sort();
      values.forEach(value => select.add(new Option(value, value)));
      select.value = values.includes(previous) ? previous : "";
    }
  }
  function base() {
    if (!multi) return window.PlumaListaOracle?.snapshot() || { todos: [], filtrados: [], busca: "" };
    const filtered = homeRows.filter(row =>
      (!$("srMergedService").value || row["Serviço"] === $("srMergedService").value) &&
      (!$("srMergedListStatus").value || row.Status === $("srMergedListStatus").value) &&
      (!$("srMergedSeverity").value || row.Severidade === $("srMergedSeverity").value));
    return { todos: homeRows, filtrados: filtered, busca: $("srMergedSearch").value };
  }
  function value(entry, column) {
    return column < listColumns.length ? text(entry.call[listColumns[column]]) :
      entry.sheet ? window.PlumaSRWorkbook.texto(entry.sheet, sheetColumns[column - listColumns.length]) : "";
  }
  function heads() {
    const group = $("srMergedGroups"); group.replaceChildren();
    for (const [label, count, css] of [["Lista de chamados", listColumns.length, "sr-merge-list-group"], ["Planilha SR — campos editáveis", sheetColumns.length, "sr-merge-workbook-group"]]) {
      const th = document.createElement("th"); th.colSpan = count; th.scope = "colgroup"; th.textContent = label; th.className = css; group.append(th);
    }
    const head = $("srMergedHead"); head.replaceChildren();
    [...listColumns, ...sheetColumns.map(i => workbook.headers[i])].forEach((label, column) => {
      const th = document.createElement("th"); th.scope = "col";
      th.setAttribute("aria-sort", sort.column === column ? (sort.direction === 1 ? "ascending" : "descending") : "none");
      const button = document.createElement("button"); button.type = "button"; button.textContent = label;
      button.title = `Ordenar por ${label}`;
      button.addEventListener("click", () => {
        sort = { column, direction: sort.column === column ? -sort.direction : 1 }; page = 1; render();
      });
      th.append(button); if (column === listColumns.length) th.classList.add("sr-merge-boundary"); head.append(th);
    });
  }
  function render() {
    workbook = window.PlumaSRWorkbook?.snapshot();
    if (!workbook || !active()) return;
    sheetColumns = workbook.columns.filter(i => i !== 2);
    const index = new Map();
    for (const row of workbook.rows) {
      const sr = key(row.values[2]);
      if (sr) { if (!index.has(sr)) index.set(sr, []); index.get(sr).push(row); }
    }
    const state = base(), query = state.busca.trim().toLocaleLowerCase("pt-BR");
    const joined = state.filtrados.flatMap(call => {
      const matches = index.get(key(call["Número SR"])) || [];
      return matches.length ? matches.map(sheet => ({ call, sheet })) :
        [{ call, sheet: window.PlumaSRWorkbook.prepararNovo(call, year) }];
    });
    entries = joined.filter(entry => !query || Array.from({ length: 32 }, (_, i) => value(entry, i).toLocaleLowerCase("pt-BR")).some(v => v.includes(query)));
    if (sort.column >= 0) entries.sort((a, b) => value(a, sort.column).localeCompare(value(b, sort.column), "pt-BR", { numeric: true, sensitivity: "base" }) * sort.direction);
    const size = $("srMergedPageSize").value === "all" ? Math.max(entries.length, 1) : Number($("srMergedPageSize").value);
    const pages = Math.max(1, Math.ceil(entries.length / size)); page = Math.max(1, Math.min(page, pages));
    const start = (page - 1) * size, body = $("srMergedBody"); body.replaceChildren(); heads();
    for (const entry of entries.slice(start, start + size)) {
      const tr = document.createElement("tr"); tr.dataset.sr = key(entry.call["Número SR"]);
      if (entry.sheet) tr.dataset.rowId = entry.sheet.id;
      listColumns.forEach((label, column) => {
        const td = document.createElement("td"); td.className = "sr-merge-list-cell"; td.textContent = value(entry, column);
        if (column === 0 && (!entry.sheet || entry.sheet.isNew)) {
          const badge = document.createElement("small"); badge.className = "sr-merge-missing";
          badge.textContent = entry.sheet?.isNew ? "Novo registro — preencha e salve" : "Sem registro na planilha"; td.append(badge);
        }
        if (column === 0 && entry.sheet) window.PlumaSRWorkbook.ferramentasVersao(entry.sheet, td);
        tr.append(td);
      });
      sheetColumns.forEach((i, position) => {
        const td = entry.sheet ? window.PlumaSRWorkbook.criarCelula(entry.sheet, i) : document.createElement("td");
        if (!entry.sheet) { td.className = "sr-merge-unmatched"; td.textContent = "—"; td.title = "Não há linha correspondente na planilha enviada."; }
        if (position === 0) td.classList.add("sr-merge-boundary"); tr.append(td);
      });
      body.append(tr);
    }
    if (!entries.length) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = 32; td.className = "sr-empty"; td.textContent = "Nenhum chamado encontrado com os filtros atuais."; tr.append(td); body.append(tr);
    }
    const distinct = [...new Set(entries.map(entry => entry.call))];
    $("srMergedCount").textContent = `${distinct.length} de ${state.todos.length} chamados • ${entries.length} linhas`;
    const matches = distinct.filter(call => index.get(key(call["Número SR"]))?.some(row => !row.isNew));
    const allKeys = new Set(state.todos.map(call => key(call["Número SR"])));
    const outside = workbook.rows.filter(row => !allKeys.has(key(row.values[2]))).length;
    $("srMergedMatches").textContent = `${matches.length} com correspondência • ${distinct.length - matches.length} sem registro na planilha`;
    $("srMergedNote").textContent = `União pelo número da SR. Repetições na planilha mantêm linhas separadas; os indicadores contam cada chamado da lista uma vez. ${outside} linha(s) da planilha fora desta lista permanecem na aba SR.`;
    $("srMergedRange").textContent = entries.length ? `${start + 1}–${Math.min(start + size, entries.length)} de ${entries.length} linhas` : "0 linhas";
    $("srMergedPageLabel").textContent = `Página ${page} de ${pages}`;
    $("srMergedPrev").disabled = page === 1; $("srMergedNext").disabled = page === pages;
    window.PlumaListaOracle?.atualizarIndicadores(distinct);
    controls();
  }
  async function loadYear() {
    const ticket = ++request; loading = true; homeRows = []; entries = []; controls();
    render();
    message("Carregando a lista de chamados...");
    try {
      const records = await window.PlumaDadosOracle.carregar(year);
      if (ticket !== request) return;
      homeRows = records.map(record => ({ ...Object.fromEntries(listColumns.map((label, i) => [label, text(record[listFields[i]])])), portal_versao: record.portal_versao, portal_atualizado_em: record.portal_atualizado_em, portal_atualizado_nome: record.portal_atualizado_nome, portal_atualizado_email: record.portal_atualizado_email }));
      homeOptions(); message("");
    } catch (error) { if (ticket === request) message(`Não foi possível carregar a lista: ${error.message}`, "danger"); }
    finally { if (ticket === request) { loading = false; render(); controls(); } }
  }
  async function open() {
    if (!await window.PlumaAbas.permitir("consolidado")) return;
    await window.plumaAuthPronto;
    await window.PlumaSRWorkbook.abrir();
    if (!window.PlumaSRWorkbook.snapshot()) { message("Não foi possível carregar a planilha SR. Abra a aba SR para consultar a falha e tentar novamente.", "danger"); return; }
    $("srMergedHomeFilters").hidden = !multi;
    $("srMergedHelp").textContent = window.PlumaSRWorkbook.snapshot().editor ?
      "Preencha também os campos das SRs sem registro na planilha. Salvar cria o registro com autor e versão; as próximas alterações ficam no mesmo histórico. Consulte o histórico pelo número da SR." :
      "Consulta dos chamados e da planilha SR na mesma linha. Somente Administrador e Gestor podem editar e salvar.";
    if (multi) {
      const profile = window.perfilAtual?.();
      const allowed = [2025, 2026].filter(y => window.usuarioEhAdminAcessos?.() || profile?.permissoes?.[`chamados_${y}`] === true);
      $("srMergedYear").replaceChildren(...allowed.map(y => new Option(String(y), String(y))));
      if (!allowed.length) { homeRows = []; entries = []; render(); controls(); message("Seu perfil não possui acesso à lista de chamados de 2025 ou 2026.", "warning"); return; }
      if (!allowed.includes(year)) { year = allowed[0]; homeRows = []; }
      $("srMergedYear").value = String(year);
      if (!homeRows.length && !loading) await loadYear();
    }
    render();
    if (!window.PlumaSRWorkbook.snapshot().cloudReady) message($("srWorkbookStatus").textContent, "danger");
  }
  async function exportExcel() {
    if (!await window.PlumaAbas.permitir("consolidado", year)) return;
    if (loading || !entries.length) return;
    $("srMergedExport").disabled = true;
    try {
      const dataHeaders = [...listColumns, ...sheetColumns.map(i => `${workbook.headers[i]} (SR)`)];
      const pendingIds = new Set(window.PlumaSRWorkbook.snapshot().linhasPendentes);
      const pendingExport = new Set(entries.filter(entry => entry.sheet && pendingIds.has(entry.sheet.id)).map(entry => entry.sheet.id)).size;
      const headers = [...dataHeaders, "Versão SR", "Salvo por (SR)", "Salvo em (SR)", "Versão chamado", "Salvo por (chamado)", "Salvo em (chamado)"];
      const date = value => value ? new Date(value) : "";
      const matrix = entries.map(entry => [...dataHeaders.map((_, i) => value(entry, i)),
        entry.sheet?.version || "", entry.sheet?.isNew ? "Ainda não salvo" : entry.sheet?.savedName || entry.sheet?.savedEmail || (entry.sheet ? (entry.sheet.version > 1 ? "Autor não registrado" : "Carga inicial") : ""), date(entry.sheet?.updatedAt),
        entry.call.portal_versao ? Number(entry.call.portal_versao) : "", entry.call.portal_atualizado_nome || entry.call.portal_atualizado_email || (Number(entry.call.portal_versao) > 1 ? "Autor não registrado" : "Base inicial"), date(entry.call.portal_atualizado_em)]);
      const filterValue = id => {
        const el = $(id); if (!el) return "Todos";
        return [...el.querySelectorAll('input[type="checkbox"]:checked')].map(e => e.value).filter(Boolean).join("; ") || "Todos";
      };
      const summary = [["Ano da lista", String(year)], ["União", "Número SR da lista = SR Number da planilha; repetições preservadas"],
        ["Busca", base().busca], ["Serviço", multi ? $("srMergedService").value || "Todos" : filterValue("filtroServico")],
        ["Status", multi ? $("srMergedListStatus").value || "Todos" : filterValue("filtroStatus")],
        ["Severidade", multi ? $("srMergedSeverity").value || "Todos" : filterValue("filtroSeveridade")],
        ["Linhas exportadas", String(matrix.length)], ["Edições pendentes incluídas", String(pendingExport)],
        ["Salvamento da SR", "Supabase com histórico de versões; rascunhos indicados não estão salvos"]];
      const blob = await window.PlumaExportacaoExcel.gerarExcel(headers, matrix, summary, "Consolidado", { titulo: "CHAMADOS ORACLE", logo: "img/logo-conecta.png", subtitulo: `Consolidado ${year} • ${matrix.length} linhas • Exportado por ${window.usuarioAtual?.() || ""}` });
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `Consolidado_SR_${year}.xlsx`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      void window.PlumaAbas.registrar("consolidado", "exportacao", { ano: year, quantidade: matrix.length, detalhes: { pendentes: pendingExport } });
      message(`Excel consolidado baixado com ${matrix.length} linhas filtradas, incluindo outras páginas e edições pendentes.`, "success");
    } catch (error) { message(`Não foi possível baixar o Excel consolidado: ${error.message}`, "danger"); void window.PlumaAbas.registrar("consolidado", "erro", { ano: year, detalhes: { tipo: "exportacao" } }); }
    finally { controls(); }
  }
  $("srMergedBody").addEventListener("input", event => window.PlumaSRWorkbook.editar(event));
  $("srMergedSave").addEventListener("click", async () => {
    message("Salvando no Supabase e registrando versões...");
    const ok = await window.PlumaSRWorkbook.salvar();
    message(ok ? "Alterações da SR salvas no Supabase com histórico de versões." : $("srWorkbookStatus").textContent, ok ? "success" : "danger");
    controls();
  });
  $("srMergedReload").addEventListener("click", async () => {
    await window.PlumaSRWorkbook.recarregar();
    render(); message($("srWorkbookStatus").textContent, window.PlumaSRWorkbook.snapshot()?.cloudReady ? "info" : "danger");
  });
  $("srMergedDiscard").addEventListener("click", () => window.PlumaSRWorkbook.descartar());
  $("srMergedExport").addEventListener("click", exportExcel);
  $("srMergedYear").addEventListener("change", () => { year = Number($("srMergedYear").value); page = 1; loadYear(); });
  for (const id of ["srMergedSearch", "srMergedService", "srMergedListStatus", "srMergedSeverity", "srMergedPageSize"]) {
    $(id).addEventListener(id === "srMergedSearch" ? "input" : "change", () => { page = 1; render(); });
  }
  $("srMergedPrev").addEventListener("click", () => { page--; render(); });
  $("srMergedNext").addEventListener("click", () => { page++; render(); });
  window.addEventListener("pluma:lista-atualizada", () => { if (active()) { page = 1; render(); } });
  window.addEventListener("pluma:planilha-salva", event => {
    if (multi && event.detail?.ano === year) { homeRows = []; if (active()) loadYear(); }
  });
  window.addEventListener("pluma:sr-alterada", event => {
    if (event.detail?.action === "input") { controls(); return; }
    if (active()) render();
    if (event.detail?.action === "reload" && active() && !window.PlumaSRWorkbook.snapshot()?.cloudReady) message($("srWorkbookStatus").textContent, "danger");
  });
  section.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (!$("srMergedSave").disabled) $("srMergedSave").click(); }
  });
  window.PlumaConsolidado = { abrir: open };
  window.addEventListener("pluma:permissoes-abas", () => { if (active()) render(); });
})();
