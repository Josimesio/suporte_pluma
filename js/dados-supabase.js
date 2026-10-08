(function () {
  "use strict";

  if (window.__PLUMA_DADOS_SUPABASE__) return;
  window.__PLUMA_DADOS_SUPABASE__ = true;

  const fetchOriginal = window.fetch.bind(window);
  const cachePorAno = new Map();

  function enderecoDaEntrada(entrada) {
    if (typeof entrada === "string") return entrada;
    if (entrada instanceof URL) return entrada.href;
    return entrada && entrada.url ? entrada.url : String(entrada || "");
  }

  function ehCsvOracle(url) {
    try {
      const caminho = new URL(enderecoDaEntrada(url), window.location.href).pathname.toLowerCase();
      return /(?:dados_sr(?:_\d{4})?|mossrsearchexport(?:_\d{4})?)\.csv$/.test(caminho);
    } catch (_) {
      return false;
    }
  }

  function obterAno(url) {
    const endereco = enderecoDaEntrada(url);
    const encontrado = endereco.match(/20\d{2}/);
    if (encontrado) return Number(encontrado[0]);
    const pagina = `${window.location.pathname} ${document.title}`.match(/20\d{2}/);
    return pagina ? Number(pagina[0]) : 2026;
  }

  function aguardarAutenticacao() {
    return window.plumaAuthPronto || Promise.resolve();
  }

  async function consultarAno(ano) {
    await aguardarAutenticacao();
    const supabase = await window.obterClienteSupabase();
    const registros = [];
    const tamanhoPagina = 1000;

    for (let inicio = 0; ; inicio += tamanhoPagina) {
      const { data, error } = await supabase
        .from("chamados_oracle")
        .select("ano,numero_sr,resumo,issue_type,servico,status,severidade,criado_texto,atualizado_texto,fechado_texto,contato_primario,grupo_usuario,tenancy,impacto_negocio,conta,referencia_cliente,criado_por,atualizado_por,url_recurso,gerado_em_texto,dados_originais,portal_versao,portal_atualizado_em,portal_atualizado_por,portal_atualizado_nome,portal_atualizado_email")
        .eq("ano", ano)
        .order("numero_sr")
        .range(inicio, inicio + tamanhoPagina - 1);

      if (error) throw error;
      registros.push(...(data || []));
      if (!data || data.length < tamanhoPagina) break;
    }
    return registros;
  }

  function carregarAno(ano) {
    if (!cachePorAno.has(ano)) cachePorAno.set(ano, consultarAno(ano).catch(error => {
      cachePorAno.delete(ano);
      throw error;
    }));
    return cachePorAno.get(ano);
  }

  // A planilha e os painéis consultam a mesma base. O banco mantém suas políticas de acesso.
  const camposEditaveis = new Set([
    "resumo", "issue_type", "servico", "status", "severidade", "criado_texto",
    "atualizado_texto", "fechado_texto", "contato_primario", "grupo_usuario", "tenancy",
    "impacto_negocio", "conta", "referencia_cliente", "url_recurso"
  ]);

  window.PlumaDadosOracle = {
    async carregar(ano, recarregar = false) {
      if (![2025, 2026].includes(Number(ano))) throw new Error("Ano inválido.");
      if (recarregar) cachePorAno.delete(Number(ano));
      const registros = await carregarAno(Number(ano));
      return registros.map(item => ({ ...item }));
    },
    async salvar(ano, numeroSr, alteracoes, original) {
      await aguardarAutenticacao();
      if (!window.usuarioPodeEditarPlanilhas?.(ano)) {
        throw new Error("Somente Administrador e Gestor podem editar e salvar a planilha.");
      }
      if (![2025, 2026].includes(Number(ano)) || !numeroSr ||
          Number(original?.ano) !== Number(ano) || original?.numero_sr !== numeroSr) {
        throw new Error("Identificação do chamado inválida.");
      }
      const campos = Object.keys(alteracoes);
      if (!campos.length || campos.some(c => !camposEditaveis.has(c))) {
        throw new Error("Campo não permitido para edição.");
      }
      const valores = {};
      for (const campo of campos) valores[campo] = String(alteracoes[campo] ?? "");
      const supabase = await window.obterClienteSupabase();
      let consulta = supabase.from("chamados_oracle").update(valores)
        .eq("ano", Number(ano)).eq("numero_sr", numeroSr);
      if (!Number.isInteger(original.portal_versao)) throw new Error("Execute sql/ATUALIZAR_ABAS_LOGS_V10.sql antes de salvar a planilha.");
      consulta = consulta.eq("portal_versao", original.portal_versao);
      // Evita sobrescrever o mesmo campo alterado por outra pessoa após a leitura.
      for (const campo of campos) {
        consulta = original[campo] == null
          ? consulta.is(campo, null) : consulta.eq(campo, original[campo]);
      }
      const { data, error } = await consulta.select();
      if (error) throw new Error(error.message || "Não foi possível salvar o chamado.");
      if (!data || data.length !== 1) {
        throw new Error("O registro mudou desde a leitura ou seu acesso não permite gravar. Recarregue os dados e confira a permissão de edição.");
      }
      cachePorAno.delete(Number(ano));
      return data[0];
    },
    async historico(ano, numeroSr, offset = 0) {
      await aguardarAutenticacao();
      const supabase = await window.obterClienteSupabase();
      const { data, error } = await supabase.from("chamados_oracle_versoes")
        .select("id,ano,numero_sr,versao,depois,alteracoes,acao,usuario_id,usuario_nome,usuario_email,alterado_em")
        .eq("ano", Number(ano)).eq("numero_sr", numeroSr).order("versao", { ascending: false }).range(offset, offset + 19);
      if (error) throw new Error(error.message || "Não foi possível consultar o histórico do chamado.");
      return data || [];
    }
  };

  function registroCompativel(item) {
    return Object.assign({}, item.dados_originais || {}, {
      "Número SR": item.numero_sr || "",
      "Numero SR": item.numero_sr || "",
      "SR Number": item.numero_sr || "",
      "Summary": item.resumo || "",
      "Issue Type": item.issue_type || "",
      "Serviço": item.servico || "",
      "Service": item.servico || "",
      "Status": item.status || "",
      "Severidade": item.severidade || "",
      "Severity": item.severidade || "",
      "Criado_dt": item.criado_texto || "",
      "Created": item.criado_texto || "",
      "Atualizado_dt": item.atualizado_texto || "",
      "Updated": item.atualizado_texto || "",
      "Closed": item.fechado_texto || "",
      "Contato Primário": item.contato_primario || "",
      "Primary Contact": item.contato_primario || "",
      "User Group Name": item.grupo_usuario || "",
      "Tenancy": item.tenancy || "",
      "Business Impact": item.impacto_negocio || "",
      "Account": item.conta || "",
      "Customer Reference": item.referencia_cliente || "",
      "Created By": item.criado_por || "",
      "Updated By": item.atualizado_por || "",
      "Resource Url": item.url_recurso || "",
      "Gerado em": item.gerado_em_texto || item.atualizado_texto || "",
      portal_versao: item.portal_versao || "",
      portal_atualizado_em: item.portal_atualizado_em || "",
      portal_atualizado_nome: item.portal_atualizado_nome || "",
      portal_atualizado_email: item.portal_atualizado_email || ""
    });
  }

  function escaparCsv(valor) {
    const texto = valor == null ? "" : String(valor);
    return `"${texto.replace(/"/g, '""')}"`;
  }

  function gerarCsv(registros) {
    const linhas = registros.map(registroCompativel);
    if (!linhas.length) return "Número SR,Serviço,Issue Type,Status,Severidade,Criado_dt,Atualizado_dt,Contato Primário,Gerado em\n";
    const cabecalhos = [...new Set(linhas.flatMap(linha => Object.keys(linha)))];
    return [
      cabecalhos.map(cabecalho => String(cabecalho).replace(/[\r\n,]/g, " ").trim()).join(","),
      ...linhas.map(linha => cabecalhos.map(cabecalho => escaparCsv(linha[cabecalho])).join(","))
    ].join("\n");
  }

  window.fetch = async function (entrada, opcoes) {
    if (!ehCsvOracle(entrada)) return fetchOriginal(entrada, opcoes);
    try {
      const ano = obterAno(entrada);
      const registros = await carregarAno(ano);
      return new Response(gerarCsv(registros), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Pluma-Data-Source": "supabase"
        }
      });
    } catch (error) {
      console.error("Falha ao consultar dados no Supabase:", error);
      return new Response(`Falha ao consultar o Supabase: ${error.message}`, {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  };

  window.limparCacheDadosOracle = function () { cachePorAno.clear(); };
})();
