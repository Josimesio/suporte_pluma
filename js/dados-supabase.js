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
        .select("ano,numero_sr,resumo,issue_type,servico,status,severidade,criado_texto,atualizado_texto,fechado_texto,contato_primario,grupo_usuario,tenancy,impacto_negocio,conta,referencia_cliente,criado_por,atualizado_por,url_recurso,gerado_em_texto,dados_originais")
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
    if (!cachePorAno.has(ano)) cachePorAno.set(ano, consultarAno(ano));
    return cachePorAno.get(ano);
  }

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
      "Gerado em": item.gerado_em_texto || item.atualizado_texto || ""
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
