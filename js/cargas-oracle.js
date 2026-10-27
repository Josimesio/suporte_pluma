  function detectarDelimitadorCsv(texto) {
    const primeiraLinha = String(texto || "").replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
    let virgulas = 0, pontosVirgula = 0, entreAspas = false;
    for (const caractere of primeiraLinha) {
      if (caractere === '"') entreAspas = !entreAspas;
      else if (!entreAspas && caractere === ',') virgulas++;
      else if (!entreAspas && caractere === ';') pontosVirgula++;
    }
    return pontosVirgula > virgulas ? ';' : ',';
  }

  function analisarCsv(texto) {
    const conteudo = String(texto || "").replace(/^\uFEFF/, "");
    const delimitador = detectarDelimitadorCsv(conteudo);
    const linhas = [];
    let linha = [], campo = "", entreAspas = false;

    for (let indice = 0; indice < conteudo.length; indice++) {
      const caractere = conteudo[indice];
      if (caractere === '"') {
        if (entreAspas && conteudo[indice + 1] === '"') {
          campo += '"';
          indice++;
        } else {
          entreAspas = !entreAspas;
        }
      } else if (caractere === delimitador && !entreAspas) {
        linha.push(campo.trim()); campo = "";
      } else if ((caractere === '\n' || caractere === '\r') && !entreAspas) {
        if (caractere === '\r' && conteudo[indice + 1] === '\n') indice++;
        linha.push(campo.trim()); campo = "";
        if (linha.some(valor => valor !== "")) linhas.push(linha);
        linha = [];
      } else {
        campo += caractere;
      }
    }
    linha.push(campo.trim());
    if (linha.some(valor => valor !== "")) linhas.push(linha);
    if (linhas.length < 2) throw new Error("O CSV não possui registros para importar.");

    const cabecalhos = linhas[0].map(valor => valor.trim());
    return linhas.slice(1).map(colunas => {
      const registro = {};
      cabecalhos.forEach((cabecalho, indice) => { registro[cabecalho] = colunas[indice] || ""; });
      return registro;
    });
  }

  function normalizarCabecalho(valor) {
    return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .trim().toLowerCase().replace(/[_\s]+/g, " ");
  }

  function obterCampo(registro, nomes) {
    const campos = new Map(Object.entries(registro).map(([chave, valor]) => [normalizarCabecalho(chave), valor]));
    for (const nome of nomes) {
      const valor = campos.get(normalizarCabecalho(nome));
      if (valor != null && String(valor).trim() !== "") return String(valor).trim();
    }
    return null;
  }

  function converterChamado(registro, ano, usuarioId) {
    const numeroSr = obterCampo(registro, ["Número SR", "Numero SR", "SR Number", "SR"]);
    if (!numeroSr) return null;
    return {
      ano,
      numero_sr: numeroSr,
      resumo: obterCampo(registro, ["Summary", "Resumo"]),
      issue_type: obterCampo(registro, ["Issue Type", "Issue Type ", "Tipo"]),
      servico: obterCampo(registro, ["Serviço", "Servico", "Service"]),
      status: obterCampo(registro, ["Status"]),
      severidade: obterCampo(registro, ["Severidade", "Severity"]),
      criado_texto: obterCampo(registro, ["Criado_dt", "Criado", "Created"]),
      atualizado_texto: obterCampo(registro, ["Atualizado_dt", "Atualizado", "Updated"]),
      fechado_texto: obterCampo(registro, ["Closed", "Fechado"]),
      contato_primario: obterCampo(registro, ["Contato Primário", "Contato Primario", "Primary Contact"]),
      grupo_usuario: obterCampo(registro, ["User Group Name", "Grupo do usuário"]),
      tenancy: obterCampo(registro, ["Tenancy"]),
      impacto_negocio: obterCampo(registro, ["Business Impact", "Impacto no negócio"]),
      conta: obterCampo(registro, ["Account", "Conta"]),
      referencia_cliente: obterCampo(registro, ["Customer Reference", "Referência do cliente"]),
      criado_por: obterCampo(registro, ["Created By", "Criado por"]),
      atualizado_por: obterCampo(registro, ["Updated By", "Atualizado por"]),
      url_recurso: obterCampo(registro, ["Resource Url", "URL do recurso"]),
      gerado_em_texto: obterCampo(registro, ["Gerado em", "Gerado_em"]),
      dados_originais: registro,
      importado_em: new Date().toISOString(),
      importado_por: usuarioId
    };
  }

  function atualizarProgressoImportacao(percentual) {
    const progresso = document.getElementById("progressoImportacao");
    const barra = document.getElementById("barraImportacao");
    progresso.classList.remove("d-none");
    barra.style.width = `${percentual}%`;
    barra.textContent = `${percentual}%`;
  }

  async function importarCsvOracle() {
    const arquivo = document.getElementById("arquivoImportacao").files[0];
    if (!window.usuarioPodeRealizarCarga?.("oracle")) return;
    const ano = Number(document.getElementById("anoImportacao").value);
    const resultado = document.getElementById("resultadoImportacao");
    const botao = document.getElementById("btnImportarCsv");

    if (![2025, 2026].includes(ano)) { resultado.textContent = "Ano inválido."; return; }
    if (!arquivo) {
      resultado.className = "small mt-2 text-danger";
      resultado.textContent = "Selecione um arquivo CSV.";
      return;
    }
    if (!arquivo.name.toLowerCase().endsWith(".csv")) {
      resultado.className = "small mt-2 text-danger";
      resultado.textContent = "O arquivo precisa ter a extensão .csv.";
      return;
    }

    botao.disabled = true;
    resultado.className = "small mt-2 text-primary";
    resultado.textContent = "Lendo e validando o arquivo...";
    atualizarProgressoImportacao(0);

    try {
      const registrosCsv = analisarCsv(await arquivo.text());
      const supabase = await obterClienteSupabase();
      const { data: dadosUsuario, error: erroUsuario } = await supabase.auth.getUser();
      if (erroUsuario || !dadosUsuario.user) throw new Error("Sessão do usuário não localizada.");

      const unicos = new Map();
      let ignorados = 0;
      registrosCsv.forEach(registro => {
        const chamado = converterChamado(registro, ano, dadosUsuario.user.id);
        if (!chamado) ignorados++;
        else unicos.set(chamado.numero_sr, chamado);
      });
      const chamados = [...unicos.values()];
      if (!chamados.length) throw new Error("Nenhuma coluna de número de SR foi localizada no CSV.");

      const tamanhoLote = 300;
      for (let inicio = 0; inicio < chamados.length; inicio += tamanhoLote) {
        const lote = chamados.slice(inicio, inicio + tamanhoLote);
        const { error } = await supabase.rpc("portal_importar_oracle", { p_ano: ano, p_linhas: lote });
        if (error) throw error;
        atualizarProgressoImportacao(Math.round(Math.min(inicio + lote.length, chamados.length) / chamados.length * 100));
      }

      resultado.className = "small mt-2 text-success fw-bold";
      resultado.textContent = `${chamados.length} chamados de ${ano} enviados ao Supabase. ${ignorados ? `${ignorados} linhas sem número de SR foram ignoradas.` : ""}`;
      document.getElementById("arquivoImportacao").value = "";
    } catch (error) {
      console.error("Falha na importação:", error);
      resultado.className = "small mt-2 text-danger fw-bold";
      resultado.textContent = `Não foi possível importar: ${["PGRST202", "42883"].includes(error.code) ? "Execute sql/ATUALIZAR_PERMISSOES_CARGAS_V19.sql no Supabase." : error.message} Os lotes anteriores já confirmados permanecem gravados; confira antes de repetir.`;
    } finally {
      botao.disabled = false;
    }
  }

