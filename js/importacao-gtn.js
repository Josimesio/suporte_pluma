/* Importação GTN exclusiva de Acessos (somente Administrador).
   Usa analisarCsv() já existente: delimitador ; e textos multilinha entre aspas. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const camposEsperados = [
    "Código", "Tipo de Ocorrência", "Ref. Externa (Ticket Cliente)", "Descrição", "Status da Ocorrência",
    "Dono (KeyUser/Cliente)", "Analista (Atendente)", "SR", "Plano de Teste", "Identif. Cenário",
    "Atividade", "Módulo/Sistema", "Área de Negócio", "Customs", "Motivo da Ocorrência",
    "Ref Interna (Ticket Atendente)", "Obs. Fechamento", "Criado em", "Criado Por",
    "Data de Atualização", "Atualizado Por"
  ];
  const normal = texto => String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  let arquivoAtual = null, listaAtual = null;
  function status(msg, tipo = "info") {
    const el = $("gtnResultadoImportacao");
    el.className = `small mt-2 text-${tipo}`; el.textContent = msg;
  }
  function progresso(p) {
    $("gtnProgresso").classList.remove("d-none");
    const b = $("gtnBarraProgresso");
    b.style.width = `${p}%`; b.textContent = `${p}%`;
  }
  async function lerCSV(arquivo) {
    const bytes = await arquivo.arrayBuffer();
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { return new TextDecoder("windows-1252").decode(bytes); }
  }
  async function prepararGTN() {
    arquivoAtual = null; listaAtual = null;
    $("gtnConfirmarImportacao").disabled = true;
    $("gtnPreviaImportacao").hidden = true;
    $("gtnProgresso").classList.add("d-none");
    const arquivo = $("gtnArquivoImportacao").files?.[0];
    if (!arquivo) { status("Selecione o CSV GTN para preparar a importação.", "danger"); return; }
    if (!arquivo.name.toLowerCase().endsWith(".csv")) { status("Selecione um arquivo .csv válido.", "danger"); return; }
    try {
      status("Validando as 21 colunas originais do GTN e os códigos únicos...", "primary");
      const texto = await lerCSV(arquivo);
      const registros = analisarCsv(texto);
      const origem = Object.keys(registros[0] || {});
      const nomina = new Map(origem.map(k => [normal(k), k]));
      const ausentes = camposEsperados.filter(c => !nomina.has(normal(c)));
      if (ausentes.length) throw new Error(`Colunas ausentes: ${ausentes.join(", ")}.`);
      const visto = new Set(), duplicados = [], semCodigo = [];
      const mapeados = registros.map((r, posicao) => {
        const dados = Object.fromEntries(camposEsperados.map(k => [k, String(r[nomina.get(normal(k))] ?? "")]));
        // Metadado opcional: preservado no JSON, sem alterar as 21 colunas GTN.
        const colunaGeracao = nomina.get("gerado em");
        if (colunaGeracao) dados["Gerado em"] = String(r[colunaGeracao] ?? "").trim();
        const codigo = dados["Código"].trim();
        if (!codigo) semCodigo.push(posicao + 2);
        if (visto.has(codigo)) duplicados.push(codigo);
        visto.add(codigo);
        return { codigo, dados };
      });
      if (semCodigo.length) throw new Error(`Código em branco na(s) linha(s) ${semCodigo.slice(0, 10).join(", ")}.`);
      if (duplicados.length) throw new Error(`Códigos duplicados no CSV: ${duplicados.slice(0, 10).join(", ")}.`);
      if (mapeados.some(r => r.codigo.length > 64)) throw new Error("Há código com mais de 64 caracteres.");
      if (mapeados.length > 20000) throw new Error("O limite por arquivo é de 20.000 ocorrências.");
      listaAtual = mapeados; arquivoAtual = arquivo;
      $("gtnResumoPrevia").textContent = `${mapeados.length} ocorrências • 21 colunas GTN • ${arquivo.name}. As 4 colunas amarelas e seu histórico serão PRESERVADOS.`;
      const corpo = $("gtnLinhasPrevia"); corpo.replaceChildren();
      for (const item of mapeados.slice(0, 8)) {
        const tr = document.createElement("tr");
        for (const campo of ["Código", "Status da Ocorrência", "Módulo/Sistema", "Dono (KeyUser/Cliente)"]) {
          const td = document.createElement("td"); td.textContent = item.dados[campo] || ""; tr.append(td);
        }
        corpo.append(tr);
      }
      $("gtnPreviaImportacao").hidden = false;
      $("gtnConfirmarImportacao").disabled = false;
      status(`Arquivo validado: ${mapeados.length} ocorrências, nenhuma chave duplicada. Confira a prévia e confirme.`, "success");
    } catch (erro) {
      status(`Arquivo inválido: ${erro.message}`, "danger");
    }
  }
  async function confirmarGTN() {
    if (!listaAtual || !arquivoAtual || !window.usuarioEhAdminAcessos?.()) return;
    if ($("gtnArquivoImportacao").files?.[0] !== arquivoAtual) {
      status("O arquivo selecionado mudou. Prepare a prévia novamente.", "danger"); return;
    }
    if (!confirm(`Confirma importar ${listaAtual.length} ocorrências do GTN? Os quatro campos amarelos não serão apagados nem alterados.`)) return;
    const botao = $("gtnConfirmarImportacao"); botao.disabled = true;
    $("gtnPrepararImportacao").disabled = true;
    progresso(10); status("Gravando a carga GTN no Supabase (transação única)...", "primary");
    try {
      const sb = await window.obterClienteSupabase();
      const { data, error } = await sb.rpc("gtn_importar_ocorrencias", {
        p_linhas: listaAtual, p_arquivo: arquivoAtual.name
      });
      if (error) throw error;
      progresso(100);
      status(`Importação concluída: ${data.novos} novos, ${data.atualizados} atualizados, ${data.inalterados} inalterados. Total ${data.total}. Comentários e histórico preservados.`, "success fw-bold");
      $("gtnArquivoImportacao").value = "";
      $("gtnPreviaImportacao").hidden = true;
      listaAtual = null; arquivoAtual = null;
    } catch (erro) {
      progresso(0);
      const msg = /gtn_importar_ocorrencias|schema cache|PGRST202|42883/i.test(erro.message)
        ? "Execute sql/INSTALAR_OCORRENCIAS_GTN_V1.sql no Supabase antes de importar." : erro.message;
      status(`Não foi possível importar: ${msg} Nenhum dado desta carga foi aplicado.`, "danger fw-bold");
      botao.disabled = false;
    } finally {
      $("gtnPrepararImportacao").disabled = false;
    }
  }
  $("gtnArquivoImportacao")?.addEventListener("change", prepararGTN);
  $("gtnPrepararImportacao")?.addEventListener("click", prepararGTN);
  $("gtnConfirmarImportacao")?.addEventListener("click", confirmarGTN);
})();
