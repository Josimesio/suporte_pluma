/*
  atualizado-destaque.js
  Padroniza e destaca "ATUALIZADO EM" em todas as páginas do dashboard.
  Também remove nomes de CSV visíveis na tela, mantendo apenas a data/hora.
*/
(function () {
  "use strict";

  const TARGET_IDS = [
    "atualizadoEm",
    "atualizadoEmPrincipal",
    "lblAtualizacaoValor",
    "updatedAt",
    "atualizadoEmAuto"
  ];

  const FILE_NAME_RE = /\b(?:dados_sr(?:_\d{4})?|MOSSrSearchExport(?:_\d{4})?)\.csv\b/ig;
  let scheduled = false;

  function brNow() {
    return new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).replace(",", "");
  }

  function formatarDataHora(valor) {
    const texto = String(valor || "").replace(/\s+BRT\s*$/i, "").trim();
    if (!texto || texto === "-" || texto === "...") return texto;

    const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/);
    if (br) {
      const dia = br[1].padStart(2, "0");
      const mes = br[2].padStart(2, "0");
      const hora = String(br[4] || "00").padStart(2, "0");
      const minuto = String(br[5] || "00").padStart(2, "0");
      return `${dia}/${mes}/${br[3]} ${hora}:${minuto}`;
    }

    const isoData = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
    if (isoData && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(texto)) {
      return `${isoData[3]}/${isoData[2]}/${isoData[1]} ${isoData[4] || "00"}:${isoData[5] || "00"}`;
    }

    const data = new Date(texto);
    if (Number.isNaN(data.getTime())) return texto;
    return data.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).replace(",", "");
  }

  function normalizarTargets() {
    TARGET_IDS.forEach((id) => {
      const alvo = document.getElementById(id);
      if (!alvo) return;
      const formatado = formatarDataHora(alvo.textContent);
      if (formatado && formatado !== alvo.textContent.trim()) alvo.textContent = formatado;
    });
  }

  function injectStyle() {
    if (document.getElementById("pl-updated-highlight-style")) return;

    const style = document.createElement("style");
    style.id = "pl-updated-highlight-style";
    style.textContent = `
      .pl-updated-line {
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        gap: 8px !important;
        margin-top: 7px !important;
      }

      .pl-updated-pill {
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 7px 12px !important;
        border-radius: 999px !important;
        background: linear-gradient(135deg, #F2C700 0%, #FFE88A 100%) !important;
        color: #003F35 !important;
        border: 2px solid rgba(255,255,255,.45) !important;
        box-shadow: 0 0 0 3px rgba(242,199,0,.18), 0 8px 18px rgba(0,0,0,.18) !important;
        font-weight: 900 !important;
        text-transform: uppercase !important;
        letter-spacing: .035em !important;
        line-height: 1 !important;
        white-space: nowrap !important;
        font-size: .82rem !important;
      }

      .pl-updated-dot {
        width: 11px !important;
        height: 11px !important;
        min-width: 11px !important;
        border-radius: 50% !important;
        background: #12B76A !important;
        box-shadow: 0 0 0 4px rgba(18,183,106,.20) !important;
      }

      .pl-updated-label {
        color: #003F35 !important;
      }

      .pl-updated-value-wrap {
        display: inline-flex !important;
        align-items: center !important;
      }

      .pl-updated-value {
        display: inline-block !important;
        background: #003F35 !important;
        color: #FFFFFF !important;
        border-radius: 999px !important;
        padding: 4px 9px !important;
        min-width: 88px !important;
        text-align: center !important;
        font-weight: 900 !important;
        letter-spacing: .01em !important;
        font-size: .9rem !important;
        text-transform: none !important;
      }

      .pl-updated-brt {
        color: #003F35 !important;
        font-weight: 900 !important;
        opacity: .9 !important;
      }

      .pl-auto-updated-holder {
        margin-top: 8px !important;
      }

      .hero-meta .pl-updated-pill {
        font-size: .86rem !important;
        padding: 8px 14px !important;
      }

      @media (max-width: 767.98px) {
        .pl-updated-pill {
          white-space: normal !important;
          justify-content: center !important;
          line-height: 1.2 !important;
        }
        .pl-updated-value {
          min-width: auto !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function stripFileNames() {
    // Esconde campos dedicados a fonte/nome do arquivo, caso algum JS volte a preencher.
    ["csvName", "fonteDados"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = "";
      if (el.parentElement) el.parentElement.style.display = "none";
    });

    if (!document.body) return;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          FILE_NAME_RE.lastIndex = 0;
          return FILE_NAME_RE.test(node.nodeValue || "")
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach((node) => {
      FILE_NAME_RE.lastIndex = 0;
      node.nodeValue = String(node.nodeValue || "").replace(FILE_NAME_RE, "").replace(/\s{2,}/g, " ").trim();
    });
  }

  function ensureTargetIfMissing() {
    const exists = TARGET_IDS.some((id) => document.getElementById(id));
    if (exists || !document.body) return;

    const host =
      document.querySelector(".pl-header .col-md-7") ||
      document.querySelector("header .col-md-7") ||
      document.querySelector(".left") ||
      document.querySelector("h1")?.parentElement ||
      document.body;

    const holder = document.createElement("div");
    holder.className = "pl-auto-updated-holder";
    holder.innerHTML = `<span id="atualizadoEmAuto">${brNow()}</span>`;
    host.appendChild(holder);
  }

  function enhanceTarget(target) {
    if (!target || target.dataset.plUpdatedEnhanced === "1") return;

    target.dataset.plUpdatedEnhanced = "1";
    target.classList.add("pl-updated-value");

    const parent = target.parentElement;

    // Se já estiver em um badge antigo da index principal, reaproveita o container.
    if (parent && parent.classList && parent.classList.contains("pl-status-badge")) {
      parent.classList.add("pl-updated-pill");
      return;
    }

    // Se já estiver dentro do badge novo, só garante classes.
    if (target.closest(".pl-updated-pill")) return;

    const badge = document.createElement("span");
    badge.className = "pl-updated-pill";
    badge.setAttribute("title", "Data e hora da última atualização dos dados");

    const dot = document.createElement("span");
    dot.className = "pl-updated-dot";
    dot.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "pl-updated-label";
    label.textContent = "ATUALIZADO EM";

    const valueWrap = document.createElement("span");
    valueWrap.className = "pl-updated-value-wrap";

    const brt = document.createElement("span");
    brt.className = "pl-updated-brt";
    brt.textContent = "BRT";

    badge.appendChild(dot);
    badge.appendChild(label);
    valueWrap.appendChild(target);
    badge.appendChild(valueWrap);
    badge.appendChild(brt);

    if (parent && parent !== document.body) {
      parent.textContent = "";
      parent.classList.add("pl-updated-line");
      parent.appendChild(badge);
    } else {
      document.body.insertBefore(badge, document.body.firstChild);
    }
  }

  function enhanceAll() {
    injectStyle();
    stripFileNames();
    ensureTargetIfMissing();
    normalizarTargets();

    TARGET_IDS.forEach((id) => {
      const target = document.getElementById(id);
      if (target) enhanceTarget(target);
    });
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceAll();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceAll);
  } else {
    enhanceAll();
  }

  window.addEventListener("load", enhanceAll);
  setTimeout(enhanceAll, 350);
  setTimeout(enhanceAll, 1200);
  setTimeout(enhanceAll, 2500);

  const observer = new MutationObserver(scheduleEnhance);
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
})();
