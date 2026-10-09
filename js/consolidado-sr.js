(function () {
  "use strict";
  const section = document.getElementById("srMerged");
  if (!section) return;
  const $ = id => document.getElementById(id);
  const host = document.querySelector("[data-planilha-oracle]");
  const multi = host.dataset.planilhaOracle === "multi";
  const listColumns = ["Número SR", "Serviço", "Issue Type", "Status", "Severidade", "Criado_dt", "Atualizado_dt", "Contato Primário"];
  const listFields = ["numero_sr", "servico", "issue_type", "status", "severidade", "criado_texto", "atualizado_texto", "contato_primario"];
  const comments = window.PlumaComentariosConsolidado;
  const commentFields = comments.fields;
  const text = v => String(v ?? "");
  const key = v => text(v).trim().replace(/\s+/g, "").toUpperCase();
  const active = () => host.classList.contains("sr-consolidated");
  let page = 1, year = Number(host.dataset.planilhaOracle) || 2026;
  let homeRows = [], entries = [], workbook, sheetColumns = [], loading = false, request = 0;
  let sort = { column: -1, direction: 1 };
  let saving = false;
  const columnCount = () => listColumns.length + sheetColumns.length + commentFields.length;
  function message(value, kind = "info") {
    $("srMergedStatus").hidden = !value;
    $("srMergedStatus").className = `sr-sheet-status alert alert-${kind} py-2`;
    $("srMergedStatus").textContent = value;
  }
  function controls() {
    const state = window.PlumaSRWorkbook?.snapshot();
    const complement = comments.snapshot(year), busy = loading || saving || state?.busy || complement.busy || window.PlumaImportacaoSR?.busy;
    const pending = (state?.pending || 0) + complement.pending;
    $("srMergedSave").disabled = busy || !(state?.cloudReady && state?.editor && state.pending || complement.ready && complement.editor && complement.pending);
    $("srMergedDiscard").disabled = busy || !pending;
    $("srMergedExport").disabled = busy || !entries.length;
    $("srMergedReload").disabled = busy;
    $("srMergedYear").disabled = busy || !!pending;
    for (const id of ["srMergedTemplate", "srMergedImport"]) {
      if ($(id)) { $(id).hidden = !complement.editor; $(id).disabled = busy || !!pending || !state?.cloudReady; }
    }
    $("srMergedPending").textContent = pending ? `${state?.pending || 0} linha(s) da SR • ${complement.pending} chamado(s) com comentários não salvos` : "Nenhuma alteração pendente";
    $("srMergedPending").classList.toggle("sr-sheet-pending", !!pending);
    $("srMergedSync").textContent = state?.cloudReady ? `SR no Supabase • última alteração: ${new Date(state.savedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "SR sem conexão ao banco • somente consulta";
    $("srMergedSync").textContent += complement.ready ? " • Comentários conectados" : " • Comentários indisponíveis";
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
    const commentIndex = column - listColumns.length - sheetColumns.length;
    if (commentIndex >= 0) return text(comments.valor(year, entry.call["Número SR"], commentFields[commentIndex]?.[0]));
    return column < listColumns.length ? text(entry.call[listColumns[column]]) :
      entry.sheet ? window.PlumaSRWorkbook.texto(entry.sheet, sheetColumns[column - listColumns.length]) : "";
  }
  function heads() {
    const group = $("srMergedGroups"); group.replaceChildren();
    for (const [label, count, css] of [["Lista de chamados", listColumns.length, "sr-merge-list-group"], ["Planilha SR — campos editáveis", sheetColumns.length, "sr-merge-workbook-group"], ["Complementos do Consolidado", commentFields.length, "sr-merge-comments-group"]]) {
      const th = document.createElement("th"); th.colSpan = count; th.scope = "colgroup"; th.textContent = label; th.className = css; group.append(th);
    }
    const head = $("srMergedHead"); head.replaceChildren();
    [...listColumns, ...sheetColumns.map(i => workbook.headers[i]), ...commentFields.map(([, label]) => label)].forEach((label, column) => {
      const th = document.createElement("th"); th.scope = "col";
      th.setAttribute("aria-sort", sort.column === column ? (sort.direction === 1 ? "ascending" : "descending") : "none");
      const button = document.createElement("button"); button.type = "button"; button.textContent = label;
      button.title = `Ordenar por ${label}`;
      button.addEventListener("click", () => {
        sort = { column, direction: sort.column === column ? -sort.direction : 1 }; page = 1; render();
      });
      th.append(button); if (column === listColumns.length) th.classList.add("sr-merge-boundary"); head.append(th);
      if (column === listColumns.length + sheetColumns.length) th.classList.add("sr-comment-boundary");
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
    entries = joined.filter(entry => !query || Array.from({ length: columnCount() }, (_, i) => value(entry, i).toLocaleLowerCase("pt-BR")).some(v => v.includes(query)));
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
        window.PlumaCelulas.anexar(td, { fonte: "chamado", linha: `${year}:${key(entry.call["Número SR"])}`, coluna: listFields[column], label, numero_sr: entry.call["Número SR"], ano: year }, entry.call.versoes_celulas || entry.call.portal_versoes_celulas);
        tr.append(td);
      });
      sheetColumns.forEach((i, position) => {
        const td = entry.sheet ? window.PlumaSRWorkbook.criarCelula(entry.sheet, i) : document.createElement("td");
        if (!entry.sheet) { td.className = "sr-merge-unmatched"; td.textContent = "—"; td.title = "Não há linha correspondente na planilha enviada."; }
        if (position === 0) td.classList.add("sr-merge-boundary"); tr.append(td);
      });
      commentFields.forEach(([field, label], position) => {
        const td = comments.criarCelula(year, entry.call["Número SR"], field, label, position === 0);
        if (position === 0) td.classList.add("sr-comment-boundary"); tr.append(td);
      });
      if (saving || loading || window.PlumaImportacaoSR?.busy) tr.querySelectorAll("input, textarea").forEach(input => { input.readOnly = true; });
      body.append(tr);
    }
    if (!entries.length) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = columnCount(); td.className = "sr-empty"; td.textContent = "Nenhum chamado encontrado com os filtros atuais."; tr.append(td); body.append(tr);
    }
    const distinct = [...new Set(entries.map(entry => entry.call))];
    $("srMergedCount").textContent = `${distinct.length} de ${state.todos.length} chamados • ${entries.length} linhas`;
    const matches = distinct.filter(call => index.get(key(call["Número SR"]))?.some(row => !row.isNew));
    const allKeys = new Set(state.todos.map(call => key(call["Número SR"])));
    const outside = workbook.rows.filter(row => !allKeys.has(key(row.values[2]))).length;
    $("srMergedMatches").textContent = `${matches.length} com correspondência • ${distinct.length - matches.length} sem registro na planilha`;
    $("srMergedNote").textContent = `União pelo número da SR. Repetições na planilha mantêm linhas separadas; os indicadores contam cada chamado da lista uma vez. ${outside} linha(s) da planilha fora desta lista permanecem na aba SR. Comentários PMO e Pluma são complementos por SR e ano, compartilhados nas repetições e preservados ao atualizar o painel.`;
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
      homeRows = records.map(record => ({ ...Object.fromEntries(listColumns.map((label, i) => [label, text(record[listFields[i]])])), portal_versao: record.portal_versao, portal_atualizado_em: record.portal_atualizado_em, portal_atualizado_nome: record.portal_atualizado_nome, portal_atualizado_email: record.portal_atualizado_email, versoes_celulas: record.versoes_celulas }));
      homeOptions(); message("");
      await comments.carregar(year);
      if (comments.snapshot(year).error) message(comments.snapshot(year).error, "warning");
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
      "Edite os campos da SR e os comentários PMO/Pluma, depois clique em Salvar consolidado. Cada coluna de cada linha tem sua própria versão e histórico. A carga semanal registra a origem Planilha; edições na tela registram Painel." :
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
    if (!comments.snapshot(year).ready && !comments.snapshot(year).error) await comments.carregar(year);
    render();
    if (comments.snapshot(year).error) message(comments.snapshot(year).error, "warning");
    if (!window.PlumaSRWorkbook.snapshot().cloudReady) message($("srWorkbookStatus").textContent, "danger");
  }
  async function exportExcel() {
    if (!await window.PlumaAbas.permitir("consolidado", year)) return;
    if (loading || !entries.length) return;
    $("srMergedExport").disabled = true;
    try {
      const dataHeaders = [...listColumns, ...sheetColumns.map(i => `${workbook.headers[i]} (SR)`), ...commentFields.map(([, label]) => label)];
      const pendingIds = new Set(window.PlumaSRWorkbook.snapshot().linhasPendentes);
      const pendingExport = new Set(entries.filter(entry => entry.sheet && pendingIds.has(entry.sheet.id)).map(entry => entry.sheet.id)).size;
      const headers = [...dataHeaders, "ID linha SR", "Versões dos campos da lista", "Versões dos campos SR", "Versões dos comentários", "Rascunho incluído?"];
      const commentDrafts = new Set(comments.snapshot(year).pendentes.filter(draft => draft.year === year).map(draft => draft.sr));
      const matrix = entries.map(entry => [...dataHeaders.map((_, i) => value(entry, i)),
        entry.sheet?.dbId || "", window.PlumaCelulas.resumo(entry.call.versoes_celulas || entry.call.portal_versoes_celulas, Object.fromEntries(listFields.map((field, i) => [field, listColumns[i]]))),
        window.PlumaCelulas.resumo(entry.sheet?.cellVersions, workbook.headers), window.PlumaCelulas.resumo(comments.registro(year, entry.call["Número SR"]).versoes_celulas, Object.fromEntries(commentFields)),
        pendingIds.has(entry.sheet?.id) || commentDrafts.has(key(entry.call["Número SR"])) ? "Sim" : "Não"]);
      const filterValue = id => {
        const el = $(id); if (!el) return "Todos";
        return [...el.querySelectorAll('input[type="checkbox"]:checked')].map(e => e.value).filter(Boolean).join("; ") || "Todos";
      };
      const summary = [["Ano da lista", String(year)], ["União", "Número SR da lista = SR Number da planilha; repetições preservadas"],
        ["Busca", base().busca], ["Serviço", multi ? $("srMergedService").value || "Todos" : filterValue("filtroServico")],
        ["Status", multi ? $("srMergedListStatus").value || "Todos" : filterValue("filtroStatus")],
        ["Severidade", multi ? $("srMergedSeverity").value || "Todos" : filterValue("filtroSeveridade")],
        ["Linhas exportadas", String(matrix.length)], ["Edições pendentes incluídas", String(pendingExport)],
        ["Comentários pendentes incluídos", String(new Set(entries.filter(entry => comments.snapshot(year).pendentes.some(draft => draft.year === year && draft.sr === key(entry.call["Número SR"])) ).map(entry => key(entry.call["Número SR"]))).size)],
        ["Comentários", comments.snapshot(year).ready ? "Complementos do Consolidado; não vêm da planilha SR" : "Indisponíveis: comentários salvos não puderam ser consultados"],
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
  $("srMergedBody").addEventListener("input", event => event.target.dataset.commentField ? comments.editar(event) : window.PlumaSRWorkbook.editar(event));
  $("srMergedSave").addEventListener("click", async () => {
    if (saving || loading || !await window.PlumaAbas.permitir("consolidado", year)) return;
    saving = true; render(); message("Salvando consolidado e registrando versões...");
    const failures = []; let commentCount = 0;
    try {
      if (window.PlumaSRWorkbook.snapshot()?.pending && !await window.PlumaSRWorkbook.salvar()) failures.push($("srWorkbookStatus").textContent);
      if (comments.snapshot(year).pending) {
        const result = await comments.salvar(); commentCount = result.saved; failures.push(...result.failures);
      }
      message(failures.length ? `As alterações que falharam continuam pendentes. ${failures.join(" | ")}` : `Consolidado salvo com histórico de versões. ${commentCount} chamado(s) com comentários salvos.`, failures.length ? "danger" : "success");
    } catch (error) { message(`Falha no salvamento: ${error.message}. As alterações não confirmadas continuam pendentes.`, "danger"); }
    finally { saving = false; render(); }
  });
  $("srMergedReload").addEventListener("click", async () => {
    if (comments.snapshot(year).pending || window.PlumaSRWorkbook.snapshot()?.pending) { message("Salve ou descarte as alterações antes de recarregar o Consolidado.", "warning"); return; }
    await window.PlumaSRWorkbook.recarregar();
    await comments.carregar(year, true);
    render(); message($("srWorkbookStatus").textContent, window.PlumaSRWorkbook.snapshot()?.cloudReady ? "info" : "danger");
    if (comments.snapshot(year).error) message(comments.snapshot(year).error, "danger");
  });
  $("srMergedDiscard").addEventListener("click", () => {
    if (confirm("Descartar as alterações da SR e dos comentários que ainda não foram salvas?")) {
      window.PlumaSRWorkbook.descartar(true); comments.descartar(); render(); message("Alterações pendentes descartadas.");
    }
  });
  $("srMergedExport").addEventListener("click", exportExcel);
  $("srMergedYear").addEventListener("change", () => {
    if (comments.snapshot(year).pending || window.PlumaSRWorkbook.snapshot()?.pending) { $("srMergedYear").value = String(year); message("Salve ou descarte as alterações antes de trocar de ano.", "warning"); return; }
    year = Number($("srMergedYear").value); page = 1; loadYear();
  });
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
  window.addEventListener("pluma:comentarios-alterados", event => { if (active() && event.detail?.action !== "input") render(); else controls(); });
  section.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (!$("srMergedSave").disabled) $("srMergedSave").click(); }
  });
  window.PlumaConsolidado = { abrir: open, aviso: message, snapshot: () => ({ ano: year, todos: base().todos }) };
  window.addEventListener("pluma:importacao-estado", () => { if (active()) render(); else controls(); });
  window.addEventListener("pluma:permissoes-abas", () => { if (active()) render(); });
})();
