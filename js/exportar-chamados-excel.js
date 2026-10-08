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

  function planilhaXML(linhas, larguras, comFiltro, marca) {
    const ultimaColuna = colunaExcel(larguras.length - 1);
    const intervalo = `A1:${ultimaColuna}${linhas.length}`;
    const cabecalho = marca ? 5 : 1;
    const colunas = larguras.map((largura, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${largura}" customWidth="1"/>`
    ).join("");
    const registros = linhas.map((valores, i) => {
      const estilo = marca && i < 3 ? (i === 0 ? 3 : i === 2 ? 5 : 4) : i === cabecalho - 1 ? 1 : (i % 2 === 0 ? 2 : 0);
      const celulas = valores.map((valor, j) => {
        const ref = `${colunaExcel(j)}${i + 1}`;
        if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
          const p = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(valor).map(p => [p.type, p.value]));
          const serial = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 86400000 + 25569;
          return `<c r="${ref}" s="6"><v>${serial}</v></c>`;
        }
        if (typeof valor === "number" && Number.isFinite(valor)) return `<c r="${ref}" s="7"><v>${valor}</v></c>`;
        return `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${escaparXML(valor)}</t></is></c>`;
      }).join("");
      const altura = marca && i < 2 ? 29 : i === cabecalho - 1 ? 30 : marca && i > 4 ? 45 : null;
      return `<row r="${i + 1}"${altura ? ` ht="${altura}" customHeight="1"` : ""}>${celulas}</row>`;
    }).join("");
    return XML + `<worksheet xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${intervalo}"/>` +
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${cabecalho}" topLeftCell="A${cabecalho + 1}" ` +
      'activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      `<sheetFormatPr defaultRowHeight="18"/><cols>${colunas}</cols>` +
      `<sheetData>${registros}</sheetData>` +
      (comFiltro ? `<autoFilter ref="A${cabecalho}:${ultimaColuna}${linhas.length}"/>` : "") +
      (marca ? '<mergeCells count="3"><mergeCell ref="A1:A3"/><mergeCell ref="B1:H2"/><mergeCell ref="B3:H3"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape"/><drawing r:id="rIdLogo"/>' : "") +
      '</worksheet>';
  }

  async function gerarExcel(cabecalhos, registros, resumo, nomeAba = "Chamados filtrados", marca = null) {
    if (typeof window.JSZip !== "function") {
      throw new Error("Arquivo js/vendor/jszip.min.js não carregado. Confira se ele foi copiado para o site.");
    }
    const zip = new window.JSZip();
    let logo;
    if (marca) {
      const resposta = await fetch(marca.logo, { cache: "force-cache" });
      if (!resposta.ok) throw new Error("Não foi possível carregar o logo da Pluma para o Excel.");
      logo = await resposta.arrayBuffer();
    }
    zip.file("[Content_Types].xml", XML +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      (marca ? '<Default Extension="png" ContentType="image/png"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : "") +
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
      `<sheet name="${escaparXML(nomeAba)}" sheetId="1" r:id="rId1"/>` +
      '<sheet name="Filtros aplicados" sheetId="2" r:id="rId2"/>' +
      '</sheets></workbook>');
    zip.file("xl/_rels/workbook.xml.rels", XML +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>');
    zip.file("xl/styles.xml", XML + `<styleSheet xmlns="${NS}">` +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm:ss"/></numFmts>' +
      '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><color rgb="FFFFFFFF"/><sz val="32"/><name val="Calibri"/></font></fonts>' +
      '<fills count="4"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF003F35"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F6F4"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="8"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>' +
      '<xf numFmtId="49" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyNumberFormat="1"/>' +
      '<xf numFmtId="49" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
      '<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1"/>' +
      '<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    const largurasPadrao = [20, 55, 32, 36, 23, 25, 25, 46];
    zip.file("xl/worksheets/sheet1.xml", planilhaXML(
      marca ? [Array.from({ length: cabecalhos.length }, (_, i) => i === 1 ? marca.titulo : ""), Array(cabecalhos.length).fill(""), Array.from({ length: cabecalhos.length }, (_, i) => i === 1 ? marca.subtitulo : ""), [], cabecalhos, ...registros] : [cabecalhos, ...registros], cabecalhos.map((_, i) => largurasPadrao[i] || 30), true, marca
    ));
    if (marca) {
      zip.file("xl/media/pluma.png", logo);
      zip.file("xl/worksheets/_rels/sheet1.xml.rels", XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
      zip.file("xl/drawings/_rels/drawing1.xml.rels", XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/pluma.png"/></Relationships>');
      zip.file("xl/drawings/drawing1.xml", XML + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>142875</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>47625</xdr:rowOff></xdr:from><xdr:ext cx="895350" cy="791846"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Logo Pluma" descr="Pluma Agroavícola"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="895350" cy="791846"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>');
    }
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
    window.addEventListener("pluma:aba-alterada", atualizarBotao);

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

  window.PlumaExportacaoExcel = { gerarExcel };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciarExportacao);
  else iniciarExportacao();
})();
