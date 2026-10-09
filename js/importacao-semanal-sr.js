(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  if (!$("srMergedImport")) return;
  let job = 0, busy = false, preview, fileName = "", fileHash = "", page = 0, changes = [];
  const normal = value => String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").replace(/\s*\(sr\)$/, "");
  const elements = (xml, name) => [...xml.getElementsByTagNameNS("*", name)];
  function parseXML(text) { const doc = new DOMParser().parseFromString(text, "application/xml"); if (doc.querySelector("parsererror")) throw new Error("Arquivo Excel com XML inválido."); return doc; }
  function xmlValue(cell, name) { return elements(cell, name)[0]?.textContent || ""; }
  function colIndex(ref) { let result = 0; for (const c of ref.match(/^[A-Z]+/)?.[0] || "A") result = result * 26 + c.charCodeAt(0) - 64; return result - 1; }
  function excelDate(serial, date1904) {
    const d = new Date(Math.round((serial + (date1904 ? 1462 : 0) - 25569) * 86400000));
    const pad = value => String(value).padStart(2, "0");
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
  async function readExcel(buffer, headers) {
    const zip = await window.JSZip.loadAsync(buffer);
    async function xml(path, optional = false) { const entry = zip.file(path); if (!entry && optional) return null; if (!entry) throw new Error(`Estrutura Excel incompleta: ${path}`); return parseXML(await entry.async("string")); }
    const workbook = await xml("xl/workbook.xml"), relationships = await xml("xl/_rels/workbook.xml.rels");
    const strings = await xml("xl/sharedStrings.xml", true), styles = await xml("xl/styles.xml", true);
    const shared = strings ? elements(strings, "si").map(si => elements(si, "t").map(t => t.textContent).join("")) : [];
    const custom = Object.fromEntries(styles ? elements(styles, "numFmt").map(f => [Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode")]) : []);
    const xfs = styles ? elements(styles, "cellXfs")[0] : null;
    const dateStyles = new Set(xfs ? [...xfs.children].flatMap((xf, i) => {
      const id = Number(xf.getAttribute("numFmtId")), format = (custom[id] || "").replace(/"[^"]*"|\\.|\[[^\]]*\]/g, "");
      return id >= 14 && id <= 22 || /[dmyhs]/i.test(format) ? [i] : [];
    }) : []);
    const date1904 = ["1", "true"].includes(elements(workbook, "workbookPr")[0]?.getAttribute("date1904"));
    const rels = Object.fromEntries(elements(relationships, "Relationship").map(rel => [rel.getAttribute("Id"), rel.getAttribute("Target")]));
    const sheets = elements(workbook, "sheet").sort((a, b) => (a.getAttribute("name") === "SRs" ? -1 : b.getAttribute("name") === "SRs" ? 1 : 0));
    for (const sheet of sheets) {
      const target = rels[sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")];
      if (!target) continue;
      const path = new URL(target, "https://excel.local/xl/workbook.xml").pathname.slice(1);
      const doc = await xml(path), rows = elements(doc, "row");
      const matrix = rows.map(row => {
        const values = [], formulas = [];
        for (const cell of elements(row, "c")) {
          const index = colIndex(cell.getAttribute("r") || "A"), type = cell.getAttribute("t"), raw = xmlValue(cell, "v");
          formulas[index] = elements(cell, "f").length > 0;
          if (type === "s") values[index] = shared[Number(raw)] || "";
          else if (type === "inlineStr") values[index] = elements(cell, "t").map(t => t.textContent).join("");
          else if (type === "e") values[index] = { error: raw };
          else if (type === "b") values[index] = raw === "1";
          else if (type === "d") { const d = new Date(raw); values[index] = excelDate(d.getTime() / 86400000 + 25569, false); }
          else if (raw === "") values[index] = null;
          else if (type === "str") values[index] = raw;
          else if (Number.isFinite(Number(raw))) values[index] = dateStyles.has(Number(cell.getAttribute("s") || 0)) ? excelDate(Number(raw), date1904) : Number(raw);
          else values[index] = raw;
        }
        return { values, formulas, row: row.getAttribute("r") };
      });
      const headerIndex = matrix.slice(0, 30).findIndex(row => headers.filter(h => row.values.some(v => normal(v) === normal(h))).length >= 20);
      if (headerIndex < 0) continue;
      const columnNames = matrix[headerIndex].values.map(normal);
      const indexes = headers.map((header, i) => columnNames.findIndex(name => name === normal(header) || i === 2 && name === "numero sr"));
      if (indexes.some(i => i < 0)) throw new Error(`Colunas ausentes: ${headers.filter((_, i) => indexes[i] < 0).join(", ")}. Use a planilha SR completa ou Baixar modelo semanal.`);
      const idColumn = columnNames.indexOf("id linha sr"), result = [];
      for (const row of matrix.slice(headerIndex + 1)) {
        const values = indexes.map(i => row.values[i] ?? null);
        if (values.every(v => v == null || v === "")) continue;
        values.forEach((value, i) => { if (value && typeof value === "object" && !(i === 9 && row.formulas[indexes[i]])) throw new Error(`Erro de Excel na linha ${row.row}, coluna ${headers[i]}: ${value.error || "valor inválido"}`); });
        if (values[9] && typeof values[9] === "object") values[9] = null;
        if (!String(values[2] ?? "").trim()) throw new Error(`Informe SR Number na linha ${row.row}.`);
        values[2] = window.PlumaCelulas.numero(values[2]);
        result.push({ id: idColumn >= 0 ? String(row.values[idColumn] || "").trim() : "", valores: values, aging_formula: !!row.formulas[indexes[9]] });
      }
      if (!result.length || result.length > 5000) throw new Error("A planilha deve ter de 1 a 5.000 linhas de SR.");
      return result;
    }
    throw new Error("Não encontrei uma aba com os 25 campos da planilha SR. Use Baixar modelo semanal para obter o formato correto.");
  }
  function setBusy(value) { busy = value; window.dispatchEvent(new CustomEvent("pluma:importacao-estado")); }
  function status(value) { $("srImportStatus").textContent = value; }
  const dialog = document.createElement("dialog"); dialog.id = "srImportDialog"; dialog.className = "sr-version-dialog";
  dialog.innerHTML = '<div class="sr-version-dialog-head"><h2>Prévia da carga semanal</h2><button id="srImportClose" type="button" class="btn btn-sm btn-outline-secondary">Fechar</button></div><p id="srImportFile"></p><p id="srImportStatus" role="status" aria-live="polite"></p><p class="small">Somente mudanças em relação à última planilha são aplicadas. Células sem mudança na planilha mantêm as edições do painel. Comentários PMO e Pluma são preservados. Aging calculado continua automático.</p><div class="sr-import-scroll"><table class="sr-version-diff"><thead><tr><th>SR / linha</th><th>Coluna</th><th>Atual no painel</th><th>Valor da planilha</th></tr></thead><tbody id="srImportBody"></tbody></table></div><div class="sr-sheet-pages"><button id="srImportPrev" type="button" class="btn btn-sm btn-outline-secondary">Anterior</button><span id="srImportPage"></span><button id="srImportNext" type="button" class="btn btn-sm btn-outline-secondary">Próxima</button><button id="srImportApply" type="button" class="btn btn-sm btn-success">Confirmar carga</button></div>';
  document.body.append(dialog);
  function renderPreview() {
    const body = $("srImportBody"); body.replaceChildren();
    const pages = Math.max(1, Math.ceil(changes.length / 100)); page = Math.max(0, Math.min(page, pages - 1));
    const headers = window.PlumaSRWorkbook.snapshot().headers;
    for (const change of changes.slice(page * 100, page * 100 + 100)) {
      const tr = body.insertRow();
      for (const value of [`${change.numero_sr}\n${change.id}`, headers[change.coluna], change.anterior ?? "(vazio)", change.novo ?? "(vazio)"]) tr.insertCell().textContent = String(value);
    }
    $("srImportPage").textContent = `Página ${page + 1} de ${pages} • ${changes.length} célula(s)`;
    $("srImportPrev").disabled = page === 0; $("srImportNext").disabled = page === pages - 1;
    $("srImportApply").disabled = !preview?.linhas.length;
  }
  function pending() { return window.PlumaSRWorkbook.snapshot()?.pending || window.PlumaComentariosConsolidado.snapshot(window.PlumaConsolidado.snapshot().ano).pending; }
  async function check() {
    const year = window.PlumaConsolidado.snapshot().ano;
    if (!await window.PlumaAbas.permitir("consolidado", year) || !window.PlumaComentariosConsolidado.snapshot(year).editor) throw new Error("Somente Administrador e Gestor autorizados podem importar.");
    if (pending()) throw new Error("Salve ou descarte os rascunhos antes de importar a planilha.");
    if (!window.PlumaSRWorkbook.snapshot()?.cloudReady) throw new Error("Conecte a planilha SR ao banco antes de importar.");
    return year;
  }
  $("srMergedImport").addEventListener("click", async () => {
    if (busy) return;
    try { await check(); $("srMergedImportFile").value = ""; $("srMergedImportFile").click(); }
    catch (error) { window.PlumaConsolidado.aviso(error.message, "warning"); }
  });
  $("srMergedImportFile").addEventListener("change", async () => {
    const file = $("srMergedImportFile").files[0]; if (!file) return;
    const jobId = ++job;
    try {
      const year = await check(); if (jobId !== job) return;
      if (!/\.xlsx$/i.test(file.name) || file.size > 15 * 1024 * 1024) throw new Error("Selecione uma planilha .xlsx com até 15 MB.");
      setBusy(true); preview = undefined; changes = []; page = 0;
      fileName = file.name; $("srImportFile").textContent = `Arquivo: ${fileName} • Ano: ${year}`;
      status("Lendo a planilha e comparando com a última carga..."); dialog.showModal(); $("srImportApply").disabled = true;
      const buffer = await file.arrayBuffer(), source = window.PlumaSRWorkbook.snapshot();
      const rows = await readExcel(buffer, source.headers);
      if (jobId !== job || !dialog.open) return;
      const hash = window.crypto?.subtle ? [...new Uint8Array(await window.crypto.subtle.digest("SHA-256", buffer))].map(b => b.toString(16).padStart(2, "0")).join("") : "";
      const sb = await window.obterClienteSupabase();
      if (jobId !== job || !dialog.open) return;
      const { data, error } = await sb.rpc("prever_importacao_sr", { p_revisao: source.revision, p_ano: year, p_linhas: rows });
      if (error) throw new Error(error.message);
      if (jobId !== job || !dialog.open) return;
      fileHash = hash; preview = data; changes = preview.linhas.flatMap(row => row.alteracoes.map(change => ({ ...change, numero_sr: row.numero_sr, id: row.id })));
      status(`${preview.celulas} célula(s) a carregar • ${preview.novas} linha(s) nova(s) • ${preview.ignoradas} linha(s) fora da lista do ano, preservadas.`);
      renderPreview();
    } catch (error) {
      if (jobId !== job) return;
      const message = `Não foi possível preparar a carga: ${error.message}. Confira também a instalação V13 no Supabase.`;
      if (dialog.open) status(message); else window.PlumaConsolidado.aviso(message, "danger");
      $("srImportApply").disabled = true;
    } finally { if (jobId === job && !dialog.open) setBusy(false); }
  });
  $("srImportApply").addEventListener("click", async () => {
    if (!preview) return;
    $("srImportApply").disabled = true; $("srImportClose").disabled = true;
    status("Importando em uma única transação e registrando a origem de cada célula...");
    try {
      await check(); const sb = await window.obterClienteSupabase();
      const { data, error } = await sb.rpc("importar_atualizacao_sr", { p_previa: preview, p_arquivo: fileName, p_hash: fileHash });
      if (error) throw new Error(error.message);
      dialog.close(); setBusy(false); preview = undefined;
      window.PlumaConsolidado.aviso(`Carga de ${fileName} concluída: ${data.celulas} célula(s) alterada(s), ${data.novas} linha(s) nova(s). Histórico por coluna × linha registrado como Planilha.`, "success");
      try { await window.PlumaSRWorkbook.recarregar(); }
      catch (error) { window.PlumaConsolidado.aviso(`Carga de ${fileName} confirmada no banco. Não foi possível atualizar a tela: ${error.message}. Recarregue a página.`, "warning"); }
    } catch (error) { status(`A carga não foi confirmada: ${error.message}. Feche e selecione o arquivo novamente para refazer a prévia.`); }
    finally { $("srImportClose").disabled = false; }
  });
  $("srImportClose").addEventListener("click", () => { job++; dialog.close(); preview = undefined; setBusy(false); });
  dialog.addEventListener("cancel", event => { if ($("srImportClose").disabled) event.preventDefault(); else { job++; preview = undefined; setBusy(false); } });
  $("srImportPrev").addEventListener("click", () => { page--; renderPreview(); });
  $("srImportNext").addEventListener("click", () => { page++; renderPreview(); });
  $("srMergedTemplate").addEventListener("click", async () => {
    if (busy) return;
    try {
      const year = await check(); setBusy(true); const state = window.PlumaSRWorkbook.snapshot();
      const calls = new Set(window.PlumaConsolidado.snapshot().todos.map(row => window.PlumaCelulas.numero(row["Número SR"])));
      const rows = state.rows.filter(row => row.dbId && calls.has(window.PlumaCelulas.numero(row.values[2])));
      const headers = [...state.headers, "ID linha SR"];
      const values = rows.map(row => [...state.headers.map((_, i) => window.PlumaSRWorkbook.valor(row, i)), row.dbId]);
      const summary = [["Ano", year], ["Como atualizar", "Edite a aba SRs. Preserve ID linha SR e SR Number. Depois use Importar atualização semanal."], ["Linhas repetidas", "O ID fixo mantém o histórico de cada linha, mesmo se a ordem mudar."], ["Comentários PMO/Pluma", "Permanecem no painel e não são importados."]];
      const blob = await window.PlumaExportacaoExcel.gerarExcel(headers, values, summary, "SRs");
      const link = document.createElement("a"), url = URL.createObjectURL(blob); link.href = url; link.download = `Modelo_semanal_SR_${year}.xlsx`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) { window.PlumaConsolidado.aviso(error.message, "danger"); }
    finally { setBusy(false); }
  });
  window.PlumaImportacaoSR = { get busy() { return busy; }, lerExcel: readExcel };
})();
