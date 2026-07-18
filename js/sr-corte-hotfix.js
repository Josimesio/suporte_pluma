/*
  Hotfix SR Período - remove nomes visíveis de CSV da tela.
  Mantém a data/hora de "Atualizado em" e não altera o fetch/carregamento dos dados.
*/
(function () {
  "use strict";

  const CSV_RE = /\bdados_sr(?:_\d{4})?\.csv\b/gi;
  const CSV_EXATO_RE = /^dados_sr(?:_\d{4})?\.csv$/i;
  const FONTE_RE = /\s*Fonte:\s*dados_sr(?:_\d{4})?\.csv(?:\s*(?:e|,)\s*dados_sr(?:_\d{4})?\.csv)?\s*/gi;

  function limparHtmlMensagem(html) {
    return String(html || "")
      .replace(/\s*\(tentando\s*<b>dados_sr(?:_\d{4})?\.csv<\/b>\)/gi, "")
      .replace(/\s*tentando\s*<b>dados_sr(?:_\d{4})?\.csv<\/b>/gi, "")
      .replace(/<b>dados_sr(?:_\d{4})?\.csv<\/b>/gi, "")
      .replace(/\s*via arquivo:\s*<b>[^<]+<\/b>/gi, "")
      .replace(FONTE_RE, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function ehElementoIgnorado(el) {
    if (!el || !el.tagName) return true;
    const tag = el.tagName.toUpperCase();
    return ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION"].includes(tag);
  }

  function ocultarElementoCsv(el) {
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("data-csv-oculto", "true");
  }

  function limparElementos() {
    if (!document.body) return;

    document.querySelectorAll("body *").forEach((el) => {
      if (ehElementoIgnorado(el)) return;

      // Remove nomes de CSV de atributos visíveis/tooltip.
      ["title", "aria-label"].forEach((attr) => {
        const v = el.getAttribute(attr);
        if (v && CSV_RE.test(v)) {
          el.setAttribute(attr, v.replace(CSV_RE, "").replace(/\s{2,}/g, " ").trim());
        }
      });

      const texto = (el.textContent || "").trim().replace(/\s+/g, " ");

      // Caso do print: um badge/cápsula contendo apenas "dados/dados_sr_2026.csv".
      if (CSV_EXATO_RE.test(texto) && el.children.length === 0) {
        ocultarElementoCsv(el);
        return;
      }

      // Remove blocos de fonte tipo: "Fonte: dados_sr_2025.csv e dados_sr_2026.csv".
      if (/^Fonte:\s*dados_sr/i.test(texto) && el.children.length === 0) {
        ocultarElementoCsv(el);
        return;
      }

      // Limpa mensagens de status sem remover data/indicadores.
      if (
        el.id === "statusBox" ||
        el.id === "msgComparativo" ||
        el.classList.contains("alert") ||
        el.classList.contains("small")
      ) {
        const antes = el.innerHTML;
        const depois = limparHtmlMensagem(antes);
        if (antes !== depois && depois) el.innerHTML = depois;
      }
    });
  }

  function limparTextNodes() {
    if (!document.body) return;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || ehElementoIgnorado(parent)) return NodeFilter.FILTER_REJECT;
          const txt = node.nodeValue || "";
          return CSV_RE.test(txt) || /Fonte:\s*dados_sr/i.test(txt)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach((node) => {
      const txt = node.nodeValue || "";
      const limpo = txt
        .replace(FONTE_RE, "")
        .replace(CSV_RE, "")
        .replace(/\s{2,}/g, " ");
      node.nodeValue = limpo;
    });
  }

  function aplicarHotfix() {
    limparElementos();
    limparTextNodes();
  }

  let agendado = false;
  function agendar() {
    if (agendado) return;
    agendado = true;
    setTimeout(() => {
      agendado = false;
      aplicarHotfix();
    }, 80);
  }

  document.addEventListener("DOMContentLoaded", aplicarHotfix);
  window.addEventListener("load", aplicarHotfix);

  setTimeout(aplicarHotfix, 250);
  setTimeout(aplicarHotfix, 1000);
  setTimeout(aplicarHotfix, 2500);

  if (window.MutationObserver) {
    const obs = new MutationObserver(agendar);
    const iniciarObserver = () => {
      if (!document.body) return;
      obs.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["title", "aria-label", "class", "style"]
      });
    };

    if (document.body) iniciarObserver();
    else document.addEventListener("DOMContentLoaded", iniciarObserver);
  }
})();
