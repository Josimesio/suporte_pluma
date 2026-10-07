/* Exportação da tabela filtrada de chamados para um arquivo Excel (.xlsx).
 * Requer js/vendor/jszip.min.js. Não altera o carregamento dos dados nem os filtros.
 */
(function () {
  "use strict";

  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  let exportando = false;

  function escaparXML(valor) {
    return String(valor ?? "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function colunaExcel(indice) {
    let nome = "";
    for (let n = indice + 1; n > 0; n = Math.floor((n - 1) / 26)) {
      nome = String.fromCharCode(65 + (n - 1) % 26) + nome;
    }
    return nome;
  }

  function planilhaXML(linhas, larguras, comFiltro) {
    const ultimaColuna = colunaExcel(larguras.length - 1);
    const intervalo = `A1:${ultimaColuna}${linhas.length}`;
    const colunas = larguras.map((largura, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${largura}" customWidth="1"/>`
    ).join("");
    const registros = linhas.map((valores, i) => {
      const estilo = i === 0 ? 1 : (i % 2 === 0 ? 2 : 0);
      const celulas = valores.map((valor, j) =>
        `<c r="${colunaExcel(j)}${i + 1}" s="${estilo}" t="inlineStr">` +
        `<is><t xml:space="preserve">${escaparXML(valor)}</t></is></c>`
      ).join("");
      return `<row r="${i + 1}"${i === 0 ? ' ht="24" customHeight="1"' : ""}>${celulas}</row>`;
    }).join("");
    return XML + `<worksheet xmlns="${NS}"><dimension ref="${intervalo}"/>` +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" ' +
      'activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      `<sheetFormatPr defaultRowHeight="18"/><cols>${colunas}</cols>` +
      `<sheetData>${registros}</sheetData>` +
      (comFiltro ? `<autoFilter ref="${intervalo}"/>` : "") +
      '</worksheet>';
  }

  async function gerarExcel(cabecalhos, registros, resumo) {
    if (typeof window.JSZip !== "function") {
      throw new Error("Arquivo js/vendor/jszip.min.js não carregado. Confira se ele foi copiado para o site.");
    }
    const zip = new window.JSZip();
    zip.file("[Content_Types].xml", XML +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>');
    zip.file("_rels/.rels", XML +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>');
    zip.file("xl/workbook.xml", XML + `<workbook xmlns="${NS}" ` +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
      '<sheet name="Chamados filtrados" sheetId="1" r:id="rId1"/>' +
      '<sheet name="Filtros aplicados" sheetId="2" r:id="rId2"/>' +
      '</sheets></workbook>');
    zip.file("xl/_rels/workbook.xml.rels", XML +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>');
    zip.file("xl/styles.xml", XML + `<styleSheet xmlns="${NS}">` +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="4"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF003F35"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F6F4"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>' +
      '<xf numFmtId="49" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyNumberFormat="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    const largurasPadrao = [20, 55, 32, 36, 23, 25, 25, 46];
    zip.file("xl/worksheets/sheet1.xml", planilhaXML(
      [cabecalhos, ...registros], cabecalhos.map((_, i) => largurasPadrao[i] || 30), true
    ));
    zip.file("xl/worksheets/sheet2.xml", planilhaXML([["Filtro / Informação", "Valor"], ...resumo], [32, 75], false));
    return zip.generateAsync({
      type: "blob", compression: "DEFLATE",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  }

  function linhasVisiveis(tbody) {
    // Todas as linhas filtradas, incluindo as que estão abaixo da rolagem.
    // A ordem do DOM acompanha a ordenação selecionada na tabela.
    return Array.from(tbody.rows).filter(tr =>
      !tr.hidden && tr.getClientRects().length > 0 && tr.cells.length > 1 &&
      !Array.from(tr.cells).some(td => td.colSpan > 1)
    );
  }

  function textoCabecalho(th) {
    const copia = th.cloneNode(true);
    copia.querySelectorAll('[aria-hidden="true"], .sort-icon, .sort-indicator, .icone-ordenacao').forEach(el => el.remove());
    return copia.textContent.trim().replace(/\s*[↕⇅↑↓▲▼▴▾]+\s*$/u, "").trim();
  }

  function valorFiltro(id, padrao) {
    const el = document.getElementById(id);
    if (!el) return padrao;
    if (el.tagName === "SELECT") {
      return el.value ? el.selectedOptions?.[0]?.textContent.trim() || el.value : padrao;
    }
    const selecionados = Array.from(el.querySelectorAll('input[type="checkbox"]:checked'))
      .map(input => input.value).filter(Boolean);
    return selecionados.length ? selecionados.join("; ") : padrao;
  }

  function iniciarExportacao() {
    const tbody = document.getElementById("tabelaSRs");
    if (!tbody || document.documentElement.dataset.exportacaoChamadosExcel === "ativa") return;
    document.documentElement.dataset.exportacaoChamadosExcel = "ativa";
    const tabela = tbody.closest("table");
    if (!tabela) return;

    const botao = document.getElementById("btnExportarExcel");
    const mensagem = document.getElementById("mensagemExportacaoChamados");
    if (!botao || !mensagem) return;

    function atualizarBotao() {
      const total = linhasVisiveis(tbody).length;
      botao.disabled = exportando || total === 0;
      botao.title = total ? `Exportar ${total} ${total === 1 ? "chamado filtrado" : "chamados filtrados"} para Excel` : "Nenhum chamado para exportar";
    }
    new MutationObserver(() => {
      atualizarBotao();
      if (!exportando) { mensagem.textContent = ""; mensagem.className = "visually-hidden"; }
    }).observe(tbody, {childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden"]});
    atualizarBotao();

    botao.addEventListener("click", async () => {
      if (exportando) return;
      const linhas = linhasVisiveis(tbody);
      if (!linhas.length) { atualizarBotao(); return; }
      const cabecalhos = Array.from(tabela.tHead?.rows[0]?.cells || []).map(textoCabecalho);
      if (!cabecalhos.length) {
        mensagem.textContent = "Não foi possível identificar as colunas da tabela.";
        return;
      }
      const registros = linhas.map(tr => Array.from(tr.cells).map(td => td.textContent.trim()));
      const agora = new Date();
      const ano = document.querySelector("h1")?.textContent.match(/\b20\d{2}\b/)?.[0] || String(agora.getFullYear());
      const resumo = [
        ["Ano da tela", ano],
        ["Serviço (Módulo)", valorFiltro("filtroServico", "Todos")],
        ["Status", valorFiltro("filtroStatus", "Todos")],
        ["Severidade", valorFiltro("filtroSeveridade", "Todas")],
        ["Busca rápida", document.getElementById("buscaTabela")?.value.trim() || "Sem busca"],
        ["Quantidade de chamados", String(registros.length)],
        ["Dados atualizados em", document.getElementById("atualizadoEm")?.textContent.trim() || "Não informado"],
        ["Exportado em", agora.toLocaleString("pt-BR")]
      ];
      exportando = true;
      atualizarBotao();
      botao.textContent = "Gerando Excel...";
      botao.setAttribute("aria-busy", "true");
      mensagem.textContent = "";
      mensagem.className = "visually-hidden";
      try {
        const arquivo = await gerarExcel(cabecalhos, registros, resumo);
        const url = URL.createObjectURL(arquivo);
        const link = document.createElement("a");
        const dois = valor => String(valor).padStart(2, "0");
        const data = `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
        const hora = `${dois(agora.getHours())}${dois(agora.getMinutes())}${dois(agora.getSeconds())}`;
        link.href = url;
        link.download = `Chamados_${ano}_filtrados_${data}_${hora}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        mensagem.textContent = `Excel gerado com ${registros.length} ${registros.length === 1 ? "chamado" : "chamados"}.`;
      } catch (erro) {
        console.error("Falha ao exportar chamados:", erro);
        mensagem.className = "small text-danger";
        mensagem.textContent = `Falha na exportação: ${erro.message}`;
      } finally {
        exportando = false;
        botao.textContent = "Exportar Excel";
        botao.removeAttribute("aria-busy");
        atualizarBotao();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciarExportacao);
  else iniciarExportacao();
})();
