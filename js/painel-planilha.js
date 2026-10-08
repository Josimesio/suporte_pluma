(function () {
  "use strict";
  const host = document.querySelector("[data-planilha-oracle]");
  if (!host) return;
  const $ = id => document.getElementById(id);
  const campos = [
    ["numero_sr", "Número SR"], ["resumo", "Resumo"], ["servico", "Serviço"],
    ["issue_type", "Issue Type"], ["status", "Status"], ["severidade", "Severidade"],
    ["criado_texto", "Criado_dt"], ["atualizado_texto", "Atualizado_dt"],
    ["fechado_texto", "Fechado em"], ["contato_primario", "Contato Primário"],
    ["referencia_cliente", "Referência do cliente"], ["impacto_negocio", "Impacto no negócio"],
    ["grupo_usuario", "Grupo do usuário"], ["tenancy", "Tenancy"], ["conta", "Conta"],
    ["url_recurso", "URL do recurso"]
  ];
  let ano = Number(host.dataset.planilhaOracle) || 2026;
  let dados = [], alteracoes = new Map(), pagina = 1, carregado = false, ocupado = false, editor = false;
  let ultimoCarregamento = 0;
  const texto = v => String(v ?? "");

  function mensagem(conteudo, tipo = "info") {
    const box = $("srSheetStatus");
    box.hidden = !conteudo;
    box.className = `sr-sheet-status alert alert-${tipo} py-2`;
    box.textContent = conteudo;
  }
  function controles() {
    $("srSave").disabled = ocupado || !editor || !alteracoes.size;
    $("srDiscard").disabled = ocupado || !alteracoes.size;
    $("srReload").disabled = ocupado;
    $("srExport").disabled = ocupado || !dados.length;
    $("srYear").disabled = ocupado || host.dataset.planilhaOracle !== "multi";
    $("srSearch").disabled = ocupado;
    $("srPageSize").disabled = ocupado;
    $("srPending").textContent = alteracoes.size
      ? `${alteracoes.size} chamado(s) com alterações não salvas` : "Nenhuma alteração pendente";
    $("srPending").classList.toggle("sr-sheet-pending", !!alteracoes.size);
  }
  function filtrar() {
    const termo = $("srSearch").value.trim().toLocaleLowerCase("pt-BR");
    return dados.filter(row => !termo || campos.some(([key]) =>
      texto((alteracoes.get(row.numero_sr) || {})[key] ?? row[key]).toLocaleLowerCase("pt-BR").includes(termo)));
  }
  function render() {
    const lista = filtrar();
    const tamanho = $("srPageSize").value === "all" ? Math.max(lista.length, 1) : Number($("srPageSize").value);
    const totalPaginas = Math.max(1, Math.ceil(lista.length / tamanho));
    pagina = Math.max(1, Math.min(pagina, totalPaginas));
    const inicio = (pagina - 1) * tamanho;
    const body = $("srSheetBody");
    body.replaceChildren();
    for (const row of lista.slice(inicio, inicio + tamanho)) {
      const tr = document.createElement("tr");
      tr.dataset.sr = row.numero_sr;
      for (const [key, label] of campos) {
        const td = document.createElement("td");
        if (key === "numero_sr") {
          td.textContent = row.numero_sr;
          const tools = document.createElement("span"); tools.className = "sr-version-tools";
          const version = document.createElement("small"); version.textContent = `v${row.portal_versao || 1}`;
          const history = document.createElement("button"); history.type = "button"; history.className = "sr-history-button";
          history.textContent = "Histórico"; history.disabled = ocupado;
          history.setAttribute("aria-label", `Histórico do chamado ${row.numero_sr}, ${ano}`);
          history.addEventListener("click", () => window.PlumaSRWorkbook.historicoChamado(row, campos));
          const author = document.createElement("small"); author.className = "sr-save-author";
          author.textContent = `Salvo por: ${row.portal_atualizado_nome || row.portal_atualizado_email || (Number(row.portal_versao) > 1 ? "Autor não registrado" : "Base inicial")}`;
          author.title = row.portal_atualizado_em ? `Salvo em ${new Date(row.portal_atualizado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)` : "";
          tools.append(version, history); td.append(tools, author);
        } else {
          const input = document.createElement(["resumo", "impacto_negocio"].includes(key) ? "textarea" : "input");
          if (input.tagName === "INPUT") input.type = "text";
          const change = alteracoes.get(row.numero_sr) || {};
          input.value = texto(change[key] ?? row[key]);
          input.dataset.field = key;
          input.dataset.sr = row.numero_sr;
          input.readOnly = !editor || ocupado;
          input.setAttribute("aria-label", `${label} do chamado ${row.numero_sr}`);
          if (["status", "servico", "severidade", "issue_type"].includes(key)) input.setAttribute("list", `srOptions-${key}`);
          td.classList.toggle("sr-cell-changed", Object.hasOwn(change, key));
          td.append(input);
        }
        tr.append(td);
      }
      body.append(tr);
    }
    if (!lista.length) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = campos.length;
      td.className = "sr-empty";
      td.textContent = carregado ? "Nenhum chamado encontrado." : "Abra a aba Planilha para carregar os dados.";
      tr.append(td); body.append(tr);
    }
    $("srCount").textContent = `${lista.length} de ${dados.length} chamados`;
    $("srPageLabel").textContent = `Página ${pagina} de ${totalPaginas}`;
    $("srRange").textContent = lista.length ? `${inicio + 1}–${Math.min(inicio + tamanho, lista.length)} de ${lista.length}` : "0 registros";
    $("srPrev").disabled = ocupado || pagina === 1;
    $("srNext").disabled = ocupado || pagina === totalPaginas;
    controles();
  }
  function sugestoes() {
    for (const key of ["status", "servico", "severidade", "issue_type"]) {
      const list = $(`srOptions-${key}`);
      list.replaceChildren();
      const valores = [...new Set(dados.map(row => texto(row[key])).filter(Boolean))].sort();
      for (const value of valores) { const option = document.createElement("option"); option.value = value; list.append(option); }
    }
  }
  async function carregar(force = false) {
    if (!await window.PlumaAbas.permitir("planilha", ano)) { mensagem("Visualização da Planilha não autorizada.", "warning"); return; }
    if (ocupado) return;
    if (alteracoes.size) { mensagem("Salve ou descarte as alterações antes de recarregar os dados.", "warning"); return; }
    ocupado = true; controles(); mensagem("Carregando a planilha...");
    try {
      await window.plumaAuthPronto;
      editor = !!window.usuarioPodeEditarPlanilhas?.(ano);
      dados = await window.PlumaDadosOracle.carregar(ano, force);
      carregado = true; pagina = 1; ultimoCarregamento = Date.now();
      $("srSync").textContent = `Atualizada nesta tela em ${new Date(ultimoCarregamento).toLocaleString("pt-BR")}`;
      $("srEditHelp").textContent = editor
        ? "Edite as células e clique em Salvar e atualizar painel. O número do chamado permanece fixo."
        : "Consulta e exportação disponíveis. Somente Administrador e Gestor podem editar e salvar.";
      sugestoes(); mensagem(dados.length ? "" : "Não há chamados cadastrados para este ano.");
      if (force) void window.PlumaAbas.registrar("planilha", "recarregamento", { ano, quantidade: dados.length });
    } catch (error) { mensagem(`Não foi possível carregar a planilha: ${error.message}`, "danger"); void window.PlumaAbas.registrar("planilha", "erro", { ano, detalhes: { tipo: "carregamento" } }); }
    finally { ocupado = false; render(); }
  }
  async function salvar() {
    if (!await window.PlumaAbas.permitir("planilha", ano)) return;
    editor = !!window.usuarioPodeEditarPlanilhas(ano);
    if (ocupado || !editor || !alteracoes.size) return;
    ocupado = true; render();
    const pendentes = [...alteracoes.entries()];
    let salvos = 0;
    const falhas = [];
    for (let i = 0; i < pendentes.length; i++) {
      const [numero, camposAlterados] = pendentes[i];
      mensagem(`Salvando chamado ${i + 1} de ${pendentes.length}...`);
      try {
        const indice = dados.findIndex(row => row.numero_sr === numero);
        dados[indice] = await window.PlumaDadosOracle.salvar(ano, numero, camposAlterados, dados[indice]);
        alteracoes.delete(numero); salvos++;
      } catch (error) { falhas.push(`${numero}: ${error.message}`); void window.PlumaAbas.registrar("planilha", "erro", { ano, referencia: numero, detalhes: { tipo: "salvamento" } }); }
    }
    ocupado = false; sugestoes(); render();
    if (salvos) {
      $("srSync").textContent = `Último salvamento: ${new Date().toLocaleString("pt-BR")}`;
    }
    if (falhas.length) mensagem(`${salvos} chamado(s) salvo(s). As alterações que falharam continuam pendentes. ${falhas.join(" | ")}`, "danger");
    else mensagem(`${salvos} chamado(s) salvo(s). Atualizando o painel...`, "success");
    if (salvos) window.dispatchEvent(new CustomEvent("pluma:planilha-salva", { detail: { ano } }));
  }
  async function exportar() {
    if (!await window.PlumaAbas.permitir("planilha", ano)) return;
    if (ocupado) return;
    ocupado = true; controles();
    try {
      const lista = filtrar();
      const pendingExport = lista.filter(row => alteracoes.has(row.numero_sr)).length;
      const linhas = lista.map(row => campos.map(([key]) => texto((alteracoes.get(row.numero_sr) || {})[key] ?? row[key])));
      const resumo = [["Ano", String(ano)], ["Busca", $("srSearch").value || "Todos"],
        ["Registros", String(lista.length)], ["Alterações pendentes", String(pendingExport)]];
      const blob = await window.PlumaExportacaoExcel.gerarExcel(campos.map(([,label]) => label), linhas, resumo);
      const link = document.createElement("a"), url = URL.createObjectURL(blob);
      link.href = url; link.download = `planilha_chamados_${ano}.xlsx`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      void window.PlumaAbas.registrar("planilha", "exportacao", { ano, quantidade: lista.length, detalhes: { pendentes: pendingExport } });
      mensagem(alteracoes.size ? "Excel baixado com as edições pendentes. Clique em Salvar para aplicá-las ao painel." : "Planilha Excel baixada.", "success");
    } catch (error) { mensagem(`Falha ao baixar Excel: ${error.message}`, "danger"); void window.PlumaAbas.registrar("planilha", "erro", { ano, detalhes: { tipo: "exportacao" } }); }
    finally { ocupado = false; controles(); }
  }
  async function selecionarAba(aba) {
    await window.plumaAuthPronto;
    if (aba !== "painel" && !await window.PlumaAbas.permitir(aba)) return;
    const anterior = host.querySelector('[data-sr-tab][aria-selected="true"]')?.dataset.srTab;
    if (aba !== "painel" && anterior !== aba) void window.PlumaAbas.registrar(aba, "acesso");
    const consolidado = aba === "consolidado";
    const mostrarPlanilha = aba === "planilha";
    const mostrarSR = aba === "sr";
    const mostrarPainel = aba === "painel" || consolidado;
    host.classList.toggle("sr-consolidated", consolidado);
    $("srPanel").hidden = !mostrarPainel;
    $("srSheet").hidden = !mostrarPlanilha;
    $("srWorkbook").hidden = !mostrarSR;
    $("srMerged").hidden = !consolidado;
    if (consolidado) {
      $("srViews").setAttribute("role", "tabpanel");
      $("srViews").setAttribute("aria-labelledby", "srConsolidatedTab");
    } else {
      $("srViews").removeAttribute("role");
      $("srViews").removeAttribute("aria-labelledby");
    }
    $("srPanel").setAttribute("role", consolidado ? "region" : "tabpanel");
    $("srSheet").setAttribute("role", consolidado ? "region" : "tabpanel");
    $("srWorkbook").setAttribute("role", consolidado ? "region" : "tabpanel");
    for (const button of host.querySelectorAll("[data-sr-tab]")) {
      const ativo = button.dataset.srTab === aba;
      button.setAttribute("aria-selected", String(ativo)); button.tabIndex = ativo ? 0 : -1;
    }
    if (mostrarPlanilha && !carregado) await carregar();
    if (mostrarSR) await window.PlumaSRWorkbook?.abrir();
    if (consolidado) await window.PlumaConsolidado?.abrir();
    else if (anterior === "consolidado") window.PlumaListaOracle?.restaurar();
    if (mostrarPainel && window.Chart?.instances) {
      requestAnimationFrame(() => Object.values(window.Chart.instances).forEach(chart => chart.resize()));
    }
    window.dispatchEvent(new CustomEvent("pluma:aba-alterada"));
  }
  for (const button of host.querySelectorAll("[data-sr-tab]")) {
    button.addEventListener("click", () => selecionarAba(button.dataset.srTab));
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...host.querySelectorAll("[data-sr-tab]")].filter(item => !item.hidden);
      const proximo = (buttons.indexOf(button) + (event.key === "ArrowLeft" ? -1 : 1) + buttons.length) % buttons.length;
      const target = event.key === "Home" ? buttons[0] : event.key === "End" ? buttons.at(-1) : buttons[proximo];
      target.focus(); selecionarAba(target.dataset.srTab);
    });
  }
  $("srSheetHead").replaceChildren(...campos.map(([,label]) => { const th = document.createElement("th"); th.scope = "col"; th.textContent = label; return th; }));
  $("srYear").value = String(ano);
  $("srYear").addEventListener("change", () => {
    if (alteracoes.size) { $("srYear").value = String(ano); mensagem("Salve ou descarte as alterações antes de trocar de ano.", "warning"); return; }
    ano = Number($("srYear").value); dados = []; carregado = false; $("srSearch").value = ""; carregar();
  });
  function aplicarAbas() {
    editor = !!window.usuarioPodeEditarPlanilhas(ano);
    if (!ocupado) render();
    for (const button of host.querySelectorAll("[data-sr-tab]")) {
      button.hidden = button.dataset.srTab !== "painel" && !window.usuarioPodeVisualizarAba(button.dataset.srTab);
    }
    const ativa = window.PlumaAbas.atual();
    if (ativa !== "painel" && !window.usuarioPodeVisualizarAba(ativa)) {
      document.getElementById("srVersionDialog")?.close();
      void selecionarAba("painel");
    }
  }
  window.plumaAuthPronto.then(aplicarAbas);
  window.addEventListener("pluma:permissoes-abas", aplicarAbas);
  window.addEventListener("focus", () => { void window.atualizarPermissoesAbas().catch(() => {}); });
  $("srSheetBody").addEventListener("input", event => {
    const input = event.target, key = input.dataset.field, numero = input.dataset.sr;
    if (!key || !editor || ocupado) return;
    const row = dados.find(item => item.numero_sr === numero);
    const change = alteracoes.get(numero) || {};
    if (input.value === texto(row[key])) delete change[key]; else change[key] = input.value;
    if (Object.keys(change).length) alteracoes.set(numero, change); else alteracoes.delete(numero);
    input.closest("td").classList.toggle("sr-cell-changed", Object.hasOwn(change, key)); controles();
  });
  $("srSearch").addEventListener("input", () => { pagina = 1; render(); });
  $("srPageSize").addEventListener("change", () => { pagina = 1; render(); });
  $("srPrev").addEventListener("click", () => { pagina--; render(); });
  $("srNext").addEventListener("click", () => { pagina++; render(); });
  $("srSave").addEventListener("click", salvar);
  $("srReload").addEventListener("click", () => carregar(true));
  $("srExport").addEventListener("click", exportar);
  $("srDiscard").addEventListener("click", () => {
    if (confirm("Descartar todas as alterações ainda não salvas?")) { alteracoes.clear(); render(); mensagem("Alterações descartadas."); }
  });
  window.addEventListener("beforeunload", event => { if (alteracoes.size) { event.preventDefault(); event.returnValue = ""; } });
  window.addEventListener("pluma:painel-atualizado", () => {
    if (!alteracoes.size) mensagem("Alterações salvas. O painel está atualizado.", "success");
  });
  window.addEventListener("pluma:painel-erro", event => {
    mensagem(`As alterações foram salvas, mas o painel não atualizou: ${event.detail.message}`, "warning");
  });
  host.addEventListener("keydown", event => {
    if (!$("srSheet").hidden && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); salvar(); }
  });
  render();
})();
