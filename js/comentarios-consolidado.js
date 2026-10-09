(function () {
  "use strict";
  // Complementos do Consolidado: nunca são lidos nem gravados na planilha SR.
  const fields = [["comentarios_pmo", "Comentários PMO"], ["comentarios_pluma", "Comentários Pluma"]];
  const key = value => String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
  const records = new Map(), drafts = new Map(), loaded = new Set(), errors = new Map();
  let busy = false, ticket = 0;
  const id = (year, sr) => `${Number(year)}:${key(sr)}`;
  const empty = (year, sr) => ({ ano: Number(year), numero_sr: key(sr), comentarios_pmo: "", comentarios_pluma: "", versao: 0 });
  const original = (year, sr) => records.get(id(year, sr)) || empty(year, sr);
  const row = (year, sr) => ({ ...original(year, sr), ...(drafts.get(id(year, sr))?.changes || {}) });
  const emit = action => window.dispatchEvent(new CustomEvent("pluma:comentarios-alterados", { detail: { action } }));
  function canEdit(year) {
    const profile = window.perfilAtual?.();
    return window.usuarioPodeEditarPlanilhas?.() && window.usuarioPodeVisualizarAba?.("consolidado") &&
      (profile?.perfil === "administrador" || profile?.permissoes?.[`chamados_${Number(year)}`] === true);
  }
  async function client() { await window.plumaAuthPronto; return window.obterClienteSupabase(); }
  function errorText(error) {
    return ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code) ?
      "Execute TODO o arquivo sql/ATUALIZAR_CELULAS_IMPORTACAO_V13.sql após a V12 para habilitar as versões por célula." :
      error.message || "Não foi possível acessar os comentários do Consolidado.";
  }
  async function load(year, force = false) {
    year = Number(year);
    if (loaded.has(year) && !force) return true;
    if (busy || drafts.size) return false;
    if (!await window.PlumaAbas.permitir("consolidado", year)) return false;
    const request = ++ticket; busy = true; emit("busy");
    try {
      const sb = await client(), result = [], size = 1000;
      for (let start = 0; ; start += size) {
        const { data, error } = await sb.from("sr_consolidado_comentarios").select("*")
          .eq("ano", year).order("numero_sr").range(start, start + size - 1);
        if (error) throw new Error(errorText(error));
        result.push(...data); if (data.length < size) break;
      }
      if (request !== ticket) return false;
      for (const [recordId, value] of records) if (value.ano === year) records.delete(recordId);
      result.forEach(value => records.set(id(year, value.numero_sr), value));
      loaded.add(year); errors.delete(year); return true;
    } catch (error) { loaded.delete(year); errors.set(year, error.message); return false; }
    finally { busy = false; emit("load"); }
  }
  function cell(year, sr, field, label, showTools) {
    const value = row(year, sr), td = document.createElement("td"), input = document.createElement("textarea");
    td.className = "sr-comment-cell";
    input.value = value[field]; input.rows = 3; input.maxLength = 20000;
    input.dataset.commentField = field; input.dataset.commentYear = year; input.dataset.commentSr = key(sr);
    input.readOnly = busy || !loaded.has(Number(year)) || !canEdit(year);
    input.placeholder = input.readOnly ? "" : "Escrever comentário";
    input.setAttribute("aria-label", `${label}, SR ${key(sr)}, ${year}`);
    td.classList.toggle("sr-cell-changed", Object.hasOwn(drafts.get(id(year, sr))?.changes || {}, field));
    td.append(input);
    window.PlumaCelulas.anexar(td, { fonte: "comentario", linha: id(year, sr), coluna: field, label, numero_sr: key(sr), ano: Number(year) }, value.versoes_celulas);
    return td;
  }
  function edit(event) {
    const input = event.target, year = Number(input.dataset.commentYear), sr = input.dataset.commentSr, field = input.dataset.commentField;
    if (!fields.some(([name]) => name === field) || !sr || busy || !loaded.has(year) || !canEdit(year) || input.readOnly) return;
    const recordId = id(year, sr), base = original(year, sr), draft = drafts.get(recordId) || { year, sr, version: base.versao, cellVersions: base.versoes_celulas, changes: {} };
    if (input.value === base[field]) delete draft.changes[field]; else draft.changes[field] = input.value;
    if (Object.keys(draft.changes).length) drafts.set(recordId, draft); else drafts.delete(recordId);
    // Repetições da mesma SR exibem o mesmo comentário, sem duplicar o salvamento.
    document.querySelectorAll("textarea[data-comment-field]").forEach(other => {
      if (Number(other.dataset.commentYear) === year && other.dataset.commentSr === sr && other.dataset.commentField === field) {
        if (other !== input) other.value = input.value;
        other.closest("td").classList.toggle("sr-cell-changed", Object.hasOwn(draft.changes, field));
      }
    });
    emit("input");
  }
  async function save() {
    if (busy || !drafts.size) return { ok: false, saved: 0, failures: [] };
    const failures = []; let saved = 0;
    busy = true; emit("busy");
    try {
      for (const [recordId, draft] of [...drafts]) {
        try {
          if (!await window.PlumaAbas.permitir("consolidado", draft.year) || !canEdit(draft.year)) throw new Error("Edição dos comentários não autorizada.");
          const sb = await client();
          const { data, error } = await sb.rpc("salvar_comentarios_celulas", {
            p_ano: draft.year, p_numero_sr: draft.sr, p_versoes: window.PlumaCelulas.esperadas(draft.cellVersions, Object.keys(draft.changes)), p_alteracoes: draft.changes
          });
          if (error) throw new Error(errorText(error));
          const result = Array.isArray(data) ? data[0] : data;
          if (!result || result.ano !== draft.year || result.numero_sr !== draft.sr || !Number.isInteger(result.versao) ||
            !Object.entries(draft.changes).every(([name, value]) => result[name] === value)) {
            throw new Error("O banco não confirmou o salvamento dos comentários. Recarregue antes de tentar novamente.");
          }
          records.set(recordId, result); drafts.delete(recordId); saved++;
        } catch (error) {
          failures.push(`SR ${draft.sr} (${draft.year}): ${error.message}`);
          void window.PlumaAbas.registrar("consolidado", "erro", { ano: draft.year, referencia: draft.sr, detalhes: { tipo: "salvamento_comentarios" } });
        }
      }
    } finally { busy = false; emit("save"); }
    return { ok: !failures.length, saved, failures };
  }
  window.PlumaComentariosConsolidado = {
    fields, carregar: load, criarCelula: cell, editar: edit, salvar: save,
    valor: (year, sr, field) => row(year, sr)[field], registro: row,
    snapshot(year) { return { busy, ready: loaded.has(Number(year)), editor: canEdit(year), pending: drafts.size, pendentes: [...drafts.values()], error: errors.get(Number(year)) || "" }; },
    descartar() { if (!busy) { drafts.clear(); emit("discard"); } },
    async historico(year, sr, offset = 0) {
      if (!await window.PlumaAbas.permitir("consolidado", year)) throw new Error("Histórico não autorizado.");
      const sb = await client();
      const { data, error } = await sb.from("sr_consolidado_comentarios_versoes").select("*")
        .eq("ano", year).eq("numero_sr", key(sr)).order("versao", { ascending: false }).range(offset, offset + 19);
      if (error) throw new Error(errorText(error)); return data || [];
    }
  };
  window.addEventListener("beforeunload", event => { if (drafts.size) { event.preventDefault(); event.returnValue = ""; } });
})();
