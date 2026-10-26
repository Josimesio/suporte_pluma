/* GTN — 21 colunas originais (somente leitura) + 4 complementos editáveis.
 * Persistência/versionamento por coluna x Código, sem alterar o Consolidado Oracle.
 */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const section = $("srOcorrencias");
  if (!section) return;
  const ORIGINAIS = [
    ["Código", "CÓDIGO"],
    ["Tipo de Ocorrência", "TIPO OCORRÊNCIA"],
    ["Ref. Externa (Ticket Cliente)", "REF.EXTERNA"],
    ["Descrição", "DESCRIÇÃO"],
    ["Status da Ocorrência", "STATUS"],
    ["Dono (KeyUser/Cliente)", "DONO KU"],
    ["Analista (Atendente)", "ANALISTA"],
    ["SR", "SR"],
    ["Plano de Teste", "PLANO DE TESTE"],
    ["Identif. Cenário", "ID CENARIO"],
    ["Atividade", "ATIVIDADE"],
    ["Módulo/Sistema", "MÓDULO/SISTEMA"],
    ["Área de Negócio", "AREA NEGOCIO"],
    ["Customs", "CUSTOMS"],
    ["Motivo da Ocorrência", "MOTIVO OCORRENCIA"],
    ["Ref Interna (Ticket Atendente)", "REF INTERNA"],
    ["Obs. Fechamento", "OBS.FECHAMENTO"],
    ["Criado em", "CRIADO EM"],
    ["Criado Por", "CRIADO POR"],
    ["Data de Atualização", "DATA ATUALIZAÇÃO"],
    ["Atualizado Por", "ATUALIZADO POR"]
  ];
  const EDITAVEIS = [
    ["comentarios_pluma", "COMENTÁRIOS PLUMA"],
    ["criticidade", "CRITICIDADE"],
    ["priorizado", "PRIORIZADO?"],
    ["data_entrega", "DATA ENTREGA"]
  ];
  const todos = [...ORIGINAIS.map(([source, name]) => ({ source, name })),
    ...EDITAVEIS.map(([key, name]) => ({ key, name }))];
  const texto = v => String(v ?? "");
  const admin = () => window.usuarioEhAdminAcessos?.() === true;
  const podeEditar = () => {
    const p = window.perfilAtual?.();
    return !!p?.ativo && (p.perfil === "administrador" ||
      (p.perfil === "gestor" && window.usuarioPodeVisualizarAba?.("ocorrencias")));
  };
  const valor = (registro, col) => col.source ? texto(registro.dados?.[col.source]) :
    texto((rascunhos.get(registro.codigo) || {})[col.key] ?? registro[col.key]);

  let dados = [], rascunhos = new Map(), pagina = 1, iniciado = false, ocupado = false;
  let ordenarPor = "Código", crescente = false, requisicao = 0;

  function aviso(msg = "", tipo = "info") {
    const node = $("gtnAviso");
    node.hidden = !msg;
    node.className = `sr-sheet-status alert alert-${tipo} py-2`;
    node.textContent = msg;
  }
  function controles() {
    const editor = podeEditar();
    $("gtnSalvar").disabled = ocupado || !editor || !rascunhos.size;
    $("gtnSalvarRodape").disabled = ocupado || !editor || !rascunhos.size;
    $("gtnDescartar").disabled = ocupado || !rascunhos.size;
    $("gtnRecarregar").disabled = ocupado;
    $("gtnExportar").disabled = ocupado || !dados.length;
    $("gtnPendentes").textContent = rascunhos.size
      ? `${rascunhos.size} ocorrência(s) com alterações pendentes`
      : "Nenhuma alteração pendente";
    $("gtnPendentes").classList.toggle("sr-sheet-pending", !!rascunhos.size);
    $("gtnOrientacao").textContent = editor
      ? "Somente as quatro colunas amarelas são editáveis. Cada célula alterada gera sua própria versão ao salvar."
      : "Consulta e exportação disponíveis. Somente Administrador e Gestor autorizado podem alterar os campos amarelos.";
  }
  // Cada filtro mantém um conjunto de valores selecionados (lógica OU dentro do filtro).
  // Entre filtros diferentes a lógica é E. A pesquisa livre também combina com os filtros.
  const filtrosMulti = [
    { id: "gtnPlanoTeste", source: "Plano de Teste" },
    { id: "gtnStatus", source: "Status da Ocorrência" },
    { id: "gtnModulo", source: "Módulo/Sistema" },
    { id: "gtnDono", source: "Dono (KeyUser/Cliente)" },
    { id: "gtnAnalista", source: "Analista (Atendente)" },
    { id: "gtnArea", source: "Área de Negócio" }
  ].map(f => ({ ...f, selecionados: new Set(), valores: [] }));
  const mapaFiltros = new Map(filtrosMulti.map(f => [f.id, f]));

  function fecharFiltro(filtro) {
    if (!filtro?.popup || filtro.popup.hidden) return;
    filtro.popup.hidden = true;
    filtro.botao.setAttribute("aria-expanded", "false");
    filtro.botao.closest(".gtn-multi").classList.remove("gtn-multi-aberto");
  }
  function fecharTodosFiltros(exceto = null) {
    filtrosMulti.forEach(f => { if (f !== exceto) fecharFiltro(f); });
  }
  function combinaBuscaOpcao(nome, termo) {
    return nome.toLocaleLowerCase("pt-BR").includes(termo.toLocaleLowerCase("pt-BR"));
  }
  function tituloFiltro(filtro) {
    const selecionados = filtro.selecionados;
    const descricao = !selecionados.size ? "Todos" :
      selecionados.size === 1 ? [...selecionados][0] : `${selecionados.size} selecionados`;
    filtro.botao.querySelector(".gtn-multi-label").textContent = descricao;
    filtro.botao.title = selecionados.size ? [...selecionados].join(" • ") : "Todos";
    filtro.botao.classList.toggle("gtn-multi-ativo", selecionados.size > 0);
  }
  function redesenharOpcoes(filtro) {
    const termo = filtro.busca.value.trim();
    const exibidos = filtro.valores.filter(nome => combinaBuscaOpcao(nome, termo));
    const lista = filtro.lista;
    lista.replaceChildren();
    for (const nome of exibidos) {
      const item = document.createElement("label"); item.className = "gtn-multi-item";
      const check = document.createElement("input"); check.type = "checkbox";
      check.checked = filtro.selecionados.has(nome);
      check.value = nome;
      check.addEventListener("change", () => {
        if (check.checked) filtro.selecionados.add(nome);
        else filtro.selecionados.delete(nome);
        tituloFiltro(filtro); pagina = 1; render();
      });
      const textoItem = document.createElement("span"); textoItem.textContent = nome;
      item.append(check, textoItem); lista.append(item);
    }
    if (!exibidos.length) {
      const avisoBusca = document.createElement("p"); avisoBusca.className = "gtn-multi-vazio";
      avisoBusca.textContent = "Nenhuma opção encontrada"; lista.append(avisoBusca);
    }
    filtro.contador.textContent = `${filtro.selecionados.size} de ${filtro.valores.length} selecionados`;
  }
  function aplicarSelecaoFiltro(filtro) {
    tituloFiltro(filtro);
    redesenharOpcoes(filtro);
    pagina = 1; render();
  }
  function prepararFiltrosMultiplos() {
    for (const filtro of filtrosMulti) {
      filtro.botao = $(filtro.id);
      filtro.popup = filtro.botao.closest(".gtn-multi").querySelector(".gtn-multi-popup");
      filtro.popup.replaceChildren();
      filtro.busca = document.createElement("input");
      filtro.busca.type = "search";
      filtro.busca.placeholder = "Pesquisar opções...";
      filtro.busca.className = "gtn-multi-pesquisa form-control form-control-sm";
      filtro.busca.setAttribute("aria-label", `Buscar valores do filtro ${filtro.botao.closest(".gtn-multi").previousElementSibling.textContent}`);
      const acoes = document.createElement("div"); acoes.className = "gtn-multi-acoes";
      const todos = document.createElement("button"); todos.type = "button";
      todos.textContent = "Selecionar exibidos";
      todos.title = "Marca todas as opções exibidas na pesquisa";
      const limpar = document.createElement("button"); limpar.type = "button";
      limpar.textContent = "Limpar";
      acoes.append(todos, limpar);
      filtro.lista = document.createElement("div");
      filtro.lista.className = "gtn-multi-lista"; filtro.lista.setAttribute("role", "group");
      filtro.contador = document.createElement("div"); filtro.contador.className = "gtn-multi-contador";
      filtro.popup.append(filtro.busca, acoes, filtro.lista, filtro.contador);
      filtro.busca.addEventListener("input", () => redesenharOpcoes(filtro));
      todos.addEventListener("click", () => {
        const termo = filtro.busca.value.trim();
        filtro.valores.filter(nome => combinaBuscaOpcao(nome, termo))
          .forEach(nome => filtro.selecionados.add(nome));
        aplicarSelecaoFiltro(filtro);
      });
      limpar.addEventListener("click", () => {
        filtro.selecionados.clear(); aplicarSelecaoFiltro(filtro);
      });
      filtro.botao.addEventListener("click", () => {
        const abrir = filtro.popup.hidden;
        fecharTodosFiltros(filtro);
        if (!abrir) { fecharFiltro(filtro); return; }
        filtro.popup.hidden = false;
        filtro.botao.setAttribute("aria-expanded", "true");
        filtro.botao.closest(".gtn-multi").classList.add("gtn-multi-aberto");
        filtro.busca.value = ""; redesenharOpcoes(filtro);
        filtro.busca.focus();
      });
      tituloFiltro(filtro);
    }
    document.addEventListener("pointerdown", ev => {
      for (const filtro of filtrosMulti) {
        if (filtro.popup.hidden) continue;
        if (!filtro.botao.closest(".gtn-multi").contains(ev.target)) fecharFiltro(filtro);
      }
    });
    document.addEventListener("keydown", ev => {
      if (ev.key !== "Escape") return;
      const aberto = filtrosMulti.find(f => !f.popup.hidden);
      if (aberto) { fecharFiltro(aberto); aberto.botao.focus(); ev.stopPropagation(); }
    });
  }
  function filtroOptions(filtro) {
    const nomes = [...new Set(dados.map(row => texto(row.dados?.[filtro.source]).trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    filtro.valores = nomes;
    // Preserva as escolhas que continuam válidas após um recarregamento do GTN.
    filtro.selecionados = new Set([...filtro.selecionados].filter(nome => nomes.includes(nome)));
    tituloFiltro(filtro);
    redesenharOpcoes(filtro);
  }
  function filtros() {
    filtrosMulti.forEach(filtroOptions);
  }
  // Um indicador pode filtrar a grade sem sobrescrever os filtros multisseleção.
  // Seus números continuam refletindo os filtros normais, permitindo alternar entre indicadores.
  let indicadorRapido = "total";
  const nomesIndicadores = {
    total: "Total de ocorrências", abertas: "STATUS ABERTA", fechadas: "STATUS FECHADAS",
    novas: "Novas", validacao: "Em validação", analise: "Em análise", melhorias: "Aguardando melhorias",
    criadas_mes: "Criadas no mês", atualizadas_mes: "Atualizadas no mês", novas_mes: "Criadas no mês e ainda novas"
  };
  function statusGTN(r) {
    return texto(r.dados?.["Status da Ocorrência"]).trim().toLocaleLowerCase("pt-BR")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  }
  function estaFechadaGTN(r) {
    // Apenas status explicitamente terminais são fechados. "SR Oracle" e
    // "Solicitado mais informações" seguem abertos; não inferir encerramento.
    return /^(fechad[oa]s?|concluid[oa]s?|finalizad[oa]s?|resolvid[oa]s?|encerrad[oa]s?|cancelad[oa]s?|closed|resolved|cancelled|canceled)(?:$|[\s(/-])/.test(statusGTN(r));
  }
  function registroMesCorrente(r, campo) {
    const hoje = new Date();
    const periodo = periodoGTN(r.dados?.[campo]);
    return !!periodo && periodo.mes === hoje.getMonth() + 1 && periodo.ano === hoje.getFullYear();
  }
  function correspondeIndicador(r) {
    switch (indicadorRapido) {
      case "abertas": return !estaFechadaGTN(r);
      case "fechadas": return estaFechadaGTN(r);
      case "novas": return statusGTN(r) === "nova";
      case "validacao": return statusGTN(r) === "em validacao";
      case "analise": return statusGTN(r) === "em analise";
      case "melhorias": return statusGTN(r) === "aguardar melhoria";
      case "criadas_mes": return registroMesCorrente(r, "Criado em");
      case "atualizadas_mes": return registroMesCorrente(r, "Data de Atualização");
      case "novas_mes": return registroMesCorrente(r, "Criado em") && statusGTN(r) === "nova";
      default: return true;
    }
  }
  function obterFiltrados(aplicarIndicador = true) {
    const busca = $("gtnBusca").value.trim().toLocaleLowerCase("pt-BR");
    const basicos = dados.filter(r => filtrosMulti.every(f => !f.selecionados.size ||
      f.selecionados.has(texto(r.dados?.[f.source]).trim())) &&
      (!busca || todos.some(c => valor(r, c).toLocaleLowerCase("pt-BR").includes(busca))));
    return aplicarIndicador ? basicos.filter(correspondeIndicador) : basicos;
  }
  function ordenar(lista) {
    const col = todos.find(c => c.source === ordenarPor || c.key === ordenarPor);
    const multiplicador = crescente ? 1 : -1;
    return lista.sort((a, b) => {
      const av = valor(a, col), bv = valor(b, col);
      const diff = av.localeCompare(bv, "pt-BR", { numeric: true, sensitivity: "base" });
      return multiplicador * (diff || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
    });
  }
  function montarCabecalho() {
    const grupos = $("gtnGrupos"), titulos = $("gtnCabecalhos");
    grupos.replaceChildren(); titulos.replaceChildren();
    for (const [nome, qtd, classe] of [
      ["GTN — DADOS ORIGINAIS (somente leitura)", ORIGINAIS.length, "gtn-grupo-fixo"],
      ["CAMPOS PLUMA — EDITÁVEIS E VERSIONADOS", EDITAVEIS.length, "gtn-grupo-editavel"]
    ]) {
      const td = document.createElement("th"); td.colSpan = qtd; td.textContent = nome;
      td.className = classe; td.scope = "colgroup"; grupos.append(td);
    }
    todos.forEach((c, i) => {
      const th = document.createElement("th");
      th.className = i >= ORIGINAIS.length ? "gtn-cab-editavel" : "";
      if (i === ORIGINAIS.length) th.classList.add("gtn-fronteira");
      th.scope = "col";
      const btn = document.createElement("button"); btn.type = "button";
      btn.textContent = c.name + (ordenarPor === (c.source || c.key) ? (crescente ? " ↑" : " ↓") : " ⇅");
      btn.title = `Ordenar por ${c.name}`;
      btn.addEventListener("click", () => {
        const nome = c.source || c.key;
        crescente = ordenarPor === nome ? !crescente : true;
        ordenarPor = nome; pagina = 1; render();
      });
      th.append(btn); titulos.append(th);
    });
  }
  function montarCampo(registro, chave, rotulo) {
    const td = document.createElement("td"); td.className = "gtn-editavel";
    if (chave === EDITAVEIS[0][0]) td.classList.add("gtn-fronteira");
    const actual = valor(registro, { key: chave });
    const control = chave === "comentarios_pluma" ? document.createElement("textarea") :
      chave === "criticidade" || chave === "priorizado" ? document.createElement("select") : document.createElement("input");
    if (chave === "criticidade" || chave === "priorizado") {
      const valores = chave === "criticidade" ? [["", "—"], ["ALTO", "Alto"], ["MÉDIO", "Médio"], ["BAIXO", "Baixo"]] :
        [["", "—"], ["S", "S"], ["N", "N"]];
      control.append(...valores.map(([id, label]) => new Option(label, id)));
    } else if (control.tagName === "INPUT") {
      control.type = "text"; control.placeholder = "DD/MM/AAAA"; control.maxLength = 10;
      control.inputMode = "numeric";
    } else {
      control.rows = 2; control.maxLength = 20000;
    }
    control.value = actual;
    control.dataset.codigo = registro.codigo;
    control.dataset.campo = chave;
    control.disabled = ocupado || !podeEditar();
    control.setAttribute("aria-label", `${rotulo} da ocorrência ${registro.codigo}`);
    td.classList.toggle("sr-cell-changed", Object.hasOwn(rascunhos.get(registro.codigo) || {}, chave));
    td.append(control);
    const informacao = registro.versoes?.[chave];
    const ferr = document.createElement("small"); ferr.className = "gtn-versao";
    ferr.textContent = `v${informacao?.versao || 0}`;
    ferr.title = informacao?.alterado_em ? `Última edição ${new Date(informacao.alterado_em).toLocaleString("pt-BR")}` : "Ainda sem alterações";
    td.append(ferr);
    if (admin()) {
      const hist = document.createElement("button"); hist.type = "button";
      hist.className = "sr-history-button"; hist.textContent = "Histórico da célula";
      hist.disabled = !(informacao?.versao > 0);
      hist.addEventListener("click", () => void verHistorico(registro.codigo, chave, rotulo));
      td.append(hist);
    }
    return td;
  }
  // Resumo GTN independente dos KPIs Oracle. Calculado sobre os MESMOS registros filtrados da grade.
  function periodoGTN(v) {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/.exec(texto(v).trim());
    if (!match) return null;
    const dia = Number(match[1]), mes = Number(match[2]), ano = Number(match[3]);
    const check = new Date(ano, mes - 1, dia);
    return check.getFullYear() === ano && check.getMonth() === mes - 1 && check.getDate() === dia
      ? { mes, ano } : null;
  }
  function atualizarIndicadores(basicos, filtrados) {
    const hoje = new Date(), mes = hoje.getMonth() + 1, ano = hoje.getFullYear();
    const nomeMes = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const referencia = nomeMes.charAt(0).toLocaleUpperCase('pt-BR') + nomeMes.slice(1);
    const registroDoMes = (r, campo) => {
      const p = periodoGTN(r.dados?.[campo]);
      return !!p && p.mes === mes && p.ano === ano;
    };
    const novas = basicos.filter(r => statusGTN(r) === 'nova').length;
    const analise = basicos.filter(r => statusGTN(r) === 'em analise').length;
    const validacao = basicos.filter(r => statusGTN(r) === 'em validacao').length;
    const melhorias = basicos.filter(r => statusGTN(r) === 'aguardar melhoria').length;
    const fechadas = basicos.filter(estaFechadaGTN).length;
    const criadas = basicos.filter(r => registroDoMes(r, 'Criado em'));
    const numeros = {
      gtnKpiTotal: basicos.length,
      gtnKpiAbertas: basicos.length - fechadas,
      gtnKpiFechadas: fechadas,
      gtnKpiNovas: novas,
      gtnKpiValidacao: validacao,
      gtnKpiAnalise: analise,
      gtnKpiMelhorias: melhorias,
      gtnKpiOutros: basicos.length - novas - analise - validacao - melhorias,
      gtnKpiComSR: basicos.filter(r => texto(r.dados?.SR).trim()).length,
      gtnKpiCriadasMes: criadas.length,
      gtnKpiAtualizadasMes: basicos.filter(r => registroDoMes(r, 'Data de Atualização')).length,
      gtnKpiNovasMes: criadas.filter(r => statusGTN(r) === 'nova').length
    };
    for (const [id, total] of Object.entries(numeros)) $(id).textContent = iniciado ? total.toLocaleString('pt-BR') : '—';
    for (const botao of section.querySelectorAll('[data-gtn-indicador]')) {
      const ativo = botao.dataset.gtnIndicador === indicadorRapido;
      botao.setAttribute('aria-pressed', String(ativo));
      botao.closest('.gtn-indicador-card').classList.toggle('gtn-indicador-ativo', ativo);
    }
    $('gtnKpiMesNome').textContent = referencia;
    $('gtnKpiMesSelo').textContent = referencia;
    const ativos = filtrosMulti.filter(f => f.selecionados.size).length + Number(!!$('gtnBusca').value.trim());
    $('gtnKpiEscopo').textContent = iniciado
      ? `${filtrados.length.toLocaleString('pt-BR')} de ${dados.length.toLocaleString('pt-BR')} ocorrências` +
        (ativos ? ` • ${ativos} filtro(s) ativo(s)` : '') +
        (indicadorRapido === 'total' ? '' : ` • Indicador: ${nomesIndicadores[indicadorRapido]}`)
      : 'Aguardando consulta ao GTN';
  }
  function render() {
    if (!section || section.hidden) return;
    montarCabecalho();
    const basicos = obterFiltrados(false);
    const filtrados = ordenar(basicos.filter(correspondeIndicador));
    atualizarIndicadores(basicos, filtrados);
    const pageSize = $("gtnTamanho").value === "all" ? Math.max(1, filtrados.length) : Number($("gtnTamanho").value);
    const paginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
    pagina = Math.max(1, Math.min(pagina, paginas));
    const de = (pagina - 1) * pageSize;
    const tbody = $("gtnCorpo"); tbody.replaceChildren();
    for (const registro of filtrados.slice(de, de + pageSize)) {
      const tr = document.createElement("tr"); tr.dataset.codigo = registro.codigo;
      for (const col of todos) {
        if (col.key) { tr.append(montarCampo(registro, col.key, col.name)); continue; }
        const td = document.createElement("td");
        if (col.source === "Código") td.className = "gtn-codigo";
        else td.className = "gtn-somente-leitura";
        const div = document.createElement("div");
        div.className = "gtn-valor"; div.textContent = texto(registro.dados?.[col.source]);
        if (["Descrição", "Obs. Fechamento", "Motivo da Ocorrência"].includes(col.source)) {
          div.classList.add("gtn-texto-longo"); div.tabIndex = 0;
          div.title = "Role dentro da célula para consultar todo o texto";
        }
        td.append(div); tr.append(td);
      }
      tbody.append(tr);
    }
    if (!filtrados.length) {
      const row = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = todos.length; td.textContent = iniciado ? "Nenhuma ocorrência encontrada." : "Abra a aba para carregar as ocorrências.";
      td.className = "sr-empty"; row.append(td); tbody.append(row);
    }
    $("gtnTotal").textContent = `${filtrados.length} de ${dados.length} ocorrências`;
    $("gtnIntervalo").textContent = filtrados.length ? `${de + 1}–${Math.min(filtrados.length, de + pageSize)} de ${filtrados.length}` : "0 registros";
    $("gtnPagina").textContent = `Página ${pagina} de ${paginas}`;
    $("gtnAnterior").disabled = pagina === 1 || ocupado;
    $("gtnProximo").disabled = pagina === paginas || ocupado;
    controles();
  }
  async function carregar(force = false, preservarPendentes = false) {
    if (!await window.PlumaAbas.permitir("ocorrencias")) {
      aviso("Sem permissão para consultar Ocorrências GTN.", "warning"); return;
    }
    if (ocupado) return;
    if (rascunhos.size && !preservarPendentes) { aviso("Salve ou descarte as alterações antes de recarregar.", "warning"); return; }
    ocupado = true; controles(); aviso("Consultando ocorrências GTN no Supabase...");
    const seq = ++requisicao;
    try {
      const sb = await window.obterClienteSupabase();
      const resultado = [];
      for (let de = 0; de < 20000; de += 500) {
        const { data, error } = await sb.from("gtn_ocorrencias")
          .select("codigo,dados,comentarios_pluma,criticidade,priorizado,data_entrega,versoes,editado_em,editado_por")
          .order("codigo", { ascending: false }).range(de, de + 499);
        if (error) throw error;
        resultado.push(...(data || []));
        if (!data || data.length < 500) break;
      }
      if (seq !== requisicao) return;
      dados = resultado;
      window.dispatchEvent(new CustomEvent("pluma:ocorrencias-carregadas", { detail: dados }));
      iniciado = true; pagina = 1;
      filtros();
      $("gtnSincronizacao").textContent = `Atualizado: ${new Date().toLocaleString("pt-BR")}`;
      aviso(dados.length ? "" : "Nenhuma ocorrência importada. Use Acessos → Importar do GTN.", "info");
    } catch (error) {
      aviso(/gtn_ocorrencias|schema cache|PGRST205|42P01/i.test(error.message)
        ? "Execute sql/INSTALAR_OCORRENCIAS_GTN_V1.sql no Supabase antes de abrir esta aba."
        : `Não foi possível carregar as ocorrências: ${error.message}`, "danger");
    } finally { ocupado = false; render(); }
  }
  async function abrir() {
    await window.plumaAuthPronto;
    // Reconsulta ao voltar para a aba: uma importacao pode ter ocorrido em Acessos.
    // Mantem rascunhos locais intactos; o usuario pode salvar/descartar antes de recarregar.
    if (!iniciado || !rascunhos.size) await carregar(true); else render();
  }
  function mudar(event) {
    const input = event.target, codigo = input?.dataset.codigo, campo = input?.dataset.campo;
    if (!codigo || !campo || !podeEditar() || ocupado) return;
    const row = dados.find(r => r.codigo === codigo);
    if (!row) return;
    const draft = rascunhos.get(codigo) || {};
    if (input.value === texto(row[campo])) delete draft[campo]; else draft[campo] = input.value;
    if (Object.keys(draft).length) rascunhos.set(codigo, draft); else rascunhos.delete(codigo);
    input.closest("td").classList.toggle("sr-cell-changed", Object.hasOwn(draft, campo));
    controles();
  }
  function dataValida(textoData) {
    const v = textoData.trim();
    if (v === "" || v === "-") return true;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
    if (!m) return false;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return d.getFullYear() === Number(m[3]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[1]);
  }
  async function salvar() {
    if (!await window.PlumaAbas.permitir("ocorrencias") || !podeEditar() || ocupado || !rascunhos.size) return;
    const divergentes = [...rascunhos].filter(([, draft]) => Object.hasOwn(draft, "data_entrega") && !dataValida(draft.data_entrega));
    if (divergentes.length) { aviso(`Data Entrega inválida em ${divergentes.map(([codigo]) => codigo).join(", ")}. Use DD/MM/AAAA.`, "warning"); return; }
    ocupado = true; controles();
    const sb = await window.obterClienteSupabase();
    let salvos = 0; const erros = [];
    for (const [codigo, draft] of [...rascunhos.entries()]) {
      aviso(`Salvando ocorrência ${codigo} (${salvos + 1} de ${rascunhos.size})...`);
      const registro = dados.find(r => r.codigo === codigo);
      const esperados = Object.fromEntries(Object.keys(draft).map(c => [c, registro[c] ?? ""]));
      const { error } = await sb.rpc("gtn_salvar_celulas", {
        p_codigo: codigo, p_alteracoes: draft, p_esperados: esperados
      });
      if (error) erros.push(`${codigo}: ${error.message}`);
      else { rascunhos.delete(codigo); salvos++; }
    }
    ocupado = false;
    if (salvos) await carregar(false, true);
    else render();
    aviso(erros.length ? `${salvos} ocorrência(s) salvas. Pendências preservadas. ${erros.join(" | ")}` :
      `${salvos} ocorrência(s) salva(s) no Supabase, com versionamento individual das células.`, erros.length ? "danger" : "success");
  }
  function descartar() {
    if (!rascunhos.size || ocupado) return;
    if (!confirm("Descartar todas as alterações ainda não salvas das Ocorrências?")) return;
    rascunhos.clear(); render(); aviso("Alterações pendentes descartadas.", "info");
  }
  async function exportar() {
    if (!await window.PlumaAbas.permitir("ocorrencias") || ocupado) return;
    ocupado = true; controles();
    try {
      const filtrados = ordenar(obterFiltrados());
      const matrix = filtrados.map(r => todos.map(c => valor(r, c)));
      const resumo = [["Origem", "GTN"], ["Quantidade", String(filtrados.length)],
        ["Indicador", nomesIndicadores[indicadorRapido]],
        ["Busca", $("gtnBusca").value || "Todas"],
        ...filtrosMulti.map(f => [f.botao.closest(".gtn-multi").previousElementSibling.textContent,
          f.selecionados.size ? [...f.selecionados].join("; ") : "Todos"]),
        ["Exportado em", new Date().toLocaleString("pt-BR")]];
      const arquivo = await window.PlumaExportacaoExcel.gerarExcel(todos.map(c => c.name), matrix, resumo,
        "Ocorrências GTN", { titulo: "OCORRÊNCIAS GTN", logo: "img/logo-conecta.png",
          subtitulo: `${filtrados.length} ocorrências • Programa Conecta` });
      const url = URL.createObjectURL(arquivo), a = document.createElement("a");
      a.href = url; a.download = `Ocorrencias_GTN_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      aviso(`Excel gerado com as 25 colunas e ${filtrados.length} ocorrência(s) filtradas.`, "success");
    } catch (error) { aviso(`Falha ao exportar: ${error.message}`, "danger"); }
    finally { ocupado = false; controles(); }
  }
  async function verHistorico(codigo, coluna, label) {
    if (!admin()) return;
    const dialog = $("gtnHistoricoModal");
    $("gtnHistoricoTitulo").textContent = `${label} • Ocorrência ${codigo}`;
    const corpo = $("gtnHistoricoCorpo"); corpo.textContent = "Carregando histórico...";
    dialog.showModal();
    const sb = await window.obterClienteSupabase();
    const { data, error } = await sb.from("gtn_ocorrencias_versoes").select("*")
      .eq("codigo", codigo).eq("coluna", coluna).order("versao", { ascending: false });
    corpo.replaceChildren();
    if (error) { corpo.textContent = `Não foi possível ler o histórico: ${error.message}`; return; }
    if (!data?.length) { corpo.textContent = "Nenhuma versão registrada."; return; }
    for (const versao of data) {
      const artigo = document.createElement("article"); artigo.className = "sr-version-card";
      const titulo = document.createElement("h3"); titulo.textContent = `Versão ${versao.versao} • ${new Date(versao.alterado_em).toLocaleString("pt-BR")}`;
      const autor = document.createElement("p"); autor.textContent = `Alterado por: ${versao.usuario_nome || versao.usuario_email || "Usuário não identificado"}`;
      const diff = document.createElement("table"); diff.className = "sr-version-diff";
      const trH = diff.createTHead().insertRow();
      for (const l of ["Antes", "Depois"]) { const h = document.createElement("th"); h.textContent = l; trH.append(h); }
      const tr = diff.createTBody().insertRow();
      for (const v of [versao.valor_anterior, versao.valor_novo]) { const td = tr.insertCell(); td.textContent = v || "(vazio)"; }
      artigo.append(titulo, autor, diff); corpo.append(artigo);
    }
  }
  section.querySelectorAll('[data-gtn-indicador]').forEach(botao => {
    botao.addEventListener('click', () => {
      const escolhido = botao.dataset.gtnIndicador;
      indicadorRapido = indicadorRapido === escolhido && escolhido !== 'total' ? 'total' : escolhido;
      pagina = 1;
      render();
    });
  });
  $("gtnCorpo").addEventListener("input", mudar);
  $("gtnCorpo").addEventListener("change", mudar);
  prepararFiltrosMultiplos();
  for (const id of ["gtnTamanho", "gtnBusca"]) {
    $(id).addEventListener(id === "gtnBusca" ? "input" : "change", () => { pagina = 1; render(); });
  }
  $("gtnAnterior").addEventListener("click", () => { pagina--; render(); });
  $("gtnProximo").addEventListener("click", () => { pagina++; render(); });
  $("gtnSalvar").addEventListener("click", salvar);
  $("gtnSalvarRodape").addEventListener("click", salvar);
  $("gtnDescartar").addEventListener("click", descartar);
  $("gtnRecarregar").addEventListener("click", () => carregar(true));
  $("gtnExportar").addEventListener("click", exportar);
  $("gtnFecharHistorico").addEventListener("click", () => $("gtnHistoricoModal").close());
  window.addEventListener("pluma:permissoes-abas", () => {
    if (!section.hidden && !window.usuarioPodeVisualizarAba?.("ocorrencias")) {
      $("gtnHistoricoModal").close();
      aviso("Acesso às ocorrências revogado.", "warning");
    }
    if (!section.hidden) render();
  });
  // Acessos pode estar aberto em outra aba/janela do navegador.
  function atualizarAoRetornar() {
    if (iniciado && !section.hidden && !document.hidden && !ocupado && !rascunhos.size) {
      void carregar(true);
    }
  }
  window.addEventListener("focus", atualizarAoRetornar);
  document.addEventListener("visibilitychange", atualizarAoRetornar);
  window.PlumaGTN = { abrir, recarregar: () => carregar(true) };
})();
