(function () {
  "use strict";
  const labels = { planilha: "Planilha", painel: "Painel", legado: "Histórico anterior", banco: "Atualização no banco" };
  const normalize = value => String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
  const date = value => value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Data não registrada";
  function map(value) {
    if (typeof value === "string") { try { return JSON.parse(value) || {}; } catch { return {}; } }
    return value || {};
  }
  function attach(td, context, versions) {
    if (!context.linha) return;
    const info = map(versions)[context.coluna] || {}, tools = document.createElement("span");
    tools.className = "sr-version-tools sr-cell-version";
    const badge = document.createElement("small"); badge.textContent = `v${info.versao || 0}`;
    const origin = document.createElement("small"); origin.textContent = labels[info.origem] || "Sem alterações";
    origin.title = [info.arquivo, info.usuario_nome || info.usuario_email, info.alterado_em ? date(info.alterado_em) : ""].filter(Boolean).join(" • ");
    const button = document.createElement("button"); button.type = "button"; button.className = "sr-history-button";
    button.textContent = "Histórico da célula"; button.disabled = !info.versao;
    button.setAttribute("aria-label", `Histórico de ${context.label}, SR ${context.numero_sr}, linha ${context.linhaLabel || context.linha}`);
    button.addEventListener("click", () => window.PlumaSRWorkbook.historicoCelula(context));
    tools.append(badge, origin, button); td.append(tools);
  }
  window.PlumaCelulas = {
    map, anexar: attach, numero: normalize,
    esperadas(versions, fields) { const source = map(versions); return Object.fromEntries(fields.map(field => [String(field), Number(source[field]?.versao || 0)])); },
    resumo(versions, headers) { return Object.entries(map(versions)).map(([field, info]) => `${headers?.[field] || field}: v${info.versao} — ${labels[info.origem] || info.origem} — ${info.usuario_nome || info.usuario_email || "Autor não registrado"} — ${date(info.alterado_em)}${info.arquivo ? ` — ${info.arquivo}` : ""}`).join("; "); },
    async historico(context, offset = 0) {
      if (!await window.PlumaAbas.permitir(context.aba || "consolidado", context.ano)) throw new Error("Histórico não autorizado.");
      const sb = await window.obterClienteSupabase();
      const { data, error } = await sb.from("consolidado_celulas_versoes").select("*")
        .eq("fonte", context.fonte).eq("linha", context.linha).eq("coluna", String(context.coluna))
        .order("versao", { ascending: false }).range(offset, offset + 19);
      if (error) throw new Error(["42P01", "PGRST205"].includes(error.code) ? "Execute sql/ATUALIZAR_CELULAS_IMPORTACAO_V13.sql para habilitar o histórico por célula." : error.message);
      return data || [];
    },
    renderizarHistorico(list, body) {
      for (const version of list) {
        const card = document.createElement("article"); card.className = "sr-version-card";
        const title = document.createElement("h3"); title.textContent = `Versão ${version.versao} da célula • ${labels[version.origem] || version.origem}`;
        const meta = document.createElement("p"); meta.textContent = `${date(version.alterado_em)} (Brasília) • ${version.usuario_nome || version.usuario_email || "Autor não registrado"}`;
        card.append(title, meta);
        if (version.arquivo) { const file = document.createElement("p"); file.textContent = `Veio da planilha: ${version.arquivo}`; card.append(file); }
        const table = document.createElement("table"); table.className = "sr-version-diff";
        const head = table.createTHead().insertRow();
        for (const label of ["Antes", "Depois"]) { const th = document.createElement("th"); th.textContent = label; head.append(th); }
        const row = table.createTBody().insertRow();
        for (const value of [version.anterior, version.novo]) { const td = row.insertCell(); td.dataset.srVersionValue = ""; td.textContent = value == null ? "(vazio)" : String(value); }
        card.append(table); body.append(card);
      }
    }
  };
})();
