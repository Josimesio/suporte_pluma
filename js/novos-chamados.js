(function () {
  "use strict";
  if (window.PlumaNovosChamados) return;
  const dayMs = 86400000;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  });
  function calendarDay(year, month, day) {
    if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date.getTime() / dayMs;
  }
  function brasiliaDay(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
    const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
    return calendarDay(Number(parts.year), Number(parts.month), Number(parts.day));
  }
  function creationDay(value) {
    if (value instanceof Date) return brasiliaDay(value);
    const text = String(value ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).at(-1) || "";
    if (!text) return null;
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/);
    if (iso) {
      const day = calendarDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
      if (day === null) return null;
      return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? brasiliaDay(new Date(text)) : day;
    }
    const local = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/);
    return local ? calendarDay(Number(local[3]), Number(local[2]), Number(local[1])) : null;
  }
  function isNew(value, now = new Date()) {
    const created = creationDay(value), today = brasiliaDay(now);
    if (created === null || today === null) return false;
    const age = today - created;
    return age >= 0 && age <= 2;
  }
  function refreshCell(cell, now = new Date()) {
    const line = cell.querySelector(":scope > .sr-number-line");
    if (!line) return;
    const existing = line.querySelector(".sr-new-badge");
    if (!isNew(cell.dataset.srNewCreated, now)) { existing?.remove(); return; }
    if (existing) return;
    const image = document.createElement("img");
    image.className = "sr-new-badge";
    image.src = "img/selo-new-pluma.png";
    image.alt = "NEW — chamado novo";
    image.title = "Chamado criado há até dois dias, pela data de Brasília.";
    image.width = 46; image.height = 30;
    image.decoding = "async";
    line.append(image);
  }
  function attach(cell, value) {
    if (!cell) return;
    cell.dataset.srNewCreated = value instanceof Date
      ? (Number.isFinite(value.getTime()) ? value.toISOString() : "")
      : String(value ?? "");
    let line = cell.querySelector(":scope > .sr-number-line");
    if (!line) {
      line = document.createElement("span"); line.className = "sr-number-line";
      while (cell.firstChild) line.append(cell.firstChild);
      cell.append(line);
    }
    refreshCell(cell);
  }
  function refresh() {
    const now = new Date();
    document.querySelectorAll("[data-sr-new-created]").forEach(cell => refreshCell(cell, now));
  }
  window.PlumaNovosChamados = { anexar: attach, ehNovo: isNew, atualizar: refresh };
  setInterval(refresh, 60000);
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
})();
