/* GTN - v5 - Ajuste exclusivo dos títulos dos cinco indicadores.
   Não altera números, estados dos chamados, filtros, tabelas ou permissões. */
(() => {
  "use strict";

  const titulos = new Map([
    ["TOTAL ABERTAS", "STATUS ABERTA"],
    ["TOTAL FECHADAS", "STATUS FECHADAS"],
    ["NOVAS", "STATUS NOVAS"],
    ["EM VALIDACAO", "STATUS EM VALIDAÇÃO"],
    ["EM ANALISE", "STATUS EM ANÁLISE"]
  ]);

  function normalizar(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  const titulosValidos = new Set([...titulos.keys(), ...[...titulos.values()].map(normalizar)]);

  function folhasComTexto(raiz, somenteProcurar = false) {
    const folhas = [];
    const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    let no;
    while ((no = walker.nextNode())) {
      const texto = normalizar(no.nodeValue);
      if (texto && titulosValidos.has(texto)) {
        folhas.push(no);
        if (somenteProcurar && folhas.length >= 4) break;
      }
    }
    return folhas;
  }

  function acharCabecalho() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let no;
    while ((no = walker.nextNode())) {
      if (normalizar(no.nodeValue) === "RESUMO DAS OCORRENCIAS GTN") return no.parentElement;
    }
    return null;
  }

  function acharAreaGTN(cabecalho) {
    // Procura o menor ancestral que engloba o título da seção e os indicadores.
    let atual = cabecalho;
    for (let n = 0; atual && n < 9 && atual !== document.body; n++, atual = atual.parentElement) {
      const labels = folhasComTexto(atual, true);
      if (labels.length >= 4) return atual;
    }
    return null;
  }

  function corrigirTitulos() {
    if (!document.body) return;
    const cabecalho = acharCabecalho();
    if (!cabecalho) return;
    const area = acharAreaGTN(cabecalho);
    if (!area) return;

    // Atualiza apenas nós de texto que são títulos inteiros, dentro do resumo GTN.
    // Mantém valores numéricos (509, 223, 286, 119, 42, 47) intocados.
    for (const no of folhasComTexto(area)) {
      const destino = titulos.get(normalizar(no.nodeValue));
      if (destino && no.nodeValue.trim() !== destino) {
        const match = no.nodeValue.match(/^(\s*)([\s\S]*?)(\s*)$/);
        no.nodeValue = match ? `${match[1]}${destino}${match[3]}` : destino;
      }
    }
  }

  let agendado = false;
  function agendarCorrecao() {
    if (agendado) return;
    agendado = true;
    queueMicrotask(() => {
      agendado = false;
      corrigirTitulos();
    });
  }

  function iniciar() {
    corrigirTitulos();
    // Alguns painéis reconstroem os indicadores após filtros/consultas: mantém os títulos.
    const observador = new MutationObserver(agendarCorrecao);
    observador.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  } else {
    iniciar();
  }
})();
