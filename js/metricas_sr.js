/**
 * metricas_sr.js
 * Camada única de métricas do dashboard Oracle SR.
 *
 * Regra oficial aplicada em todas as páginas:
 * - Total anual: quantidade de Números SR únicos criados no ano.
 * - Fechados anual: Status contendo Closed, Close Requested, Resolved ou Fechado.
 * - Abertos anual: Total - Fechados anual.
 * - Série mensal: cada SR entra uma única vez no mês em que foi criada.
 * - Dentro do mês, a SR é classificada pelo status atual como aberta ou fechada.
 * - Em cada mês: Abertos + Fechados = Criados.
 */
(function () {
  "use strict";

  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  function parseCSV(texto) {
    const linhas = String(texto || "").split(/\r?\n/).filter(l => l.trim() !== "");
    if (!linhas.length) return [];

    const headerLine = linhas[0].replace(/^\uFEFF/, "");
    const candidatos = [",", ";", "\t", "|"];
    let delim = ",";
    let maxCols = 1;

    for (const d of candidatos) {
      const cols = headerLine.split(d).length;
      if (cols > maxCols) {
        maxCols = cols;
        delim = d;
      }
    }

    const delimRegex = delim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const splitLinha = (line) =>
      line.split(new RegExp(`${delimRegex}(?=(?:[^"]*"[^"]*")*[^"]*$)`));

    const cabecalho = splitLinha(headerLine).map(h => h.trim().replace(/^"|"$/g, ""));
    const dados = [];

    for (let i = 1; i < linhas.length; i++) {
      const cols = splitLinha(linhas[i]);
      const obj = {};
      for (let j = 0; j < cabecalho.length; j++) {
        obj[cabecalho[j]] = (cols[j] || "")
          .replace(/^"|"$/g, "")
          .replace(/""/g, '"')
          .trim();
      }
      if (Object.values(obj).some(v => String(v || "").trim() !== "")) dados.push(obj);
    }
    return dados;
  }

  function parseDataRelativa(valor, baseRef) {
    const m = String(valor || "").trim().match(/^(Today|Yesterday)\s*(?:,|at)?\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;

    const base = baseRef ? parseData(baseRef) : new Date();
    if (!base || isNaN(base)) return null;

    if (/yesterday/i.test(m[1])) base.setDate(base.getDate() - 1);

    let hh = parseInt(m[2], 10);
    const mm = parseInt(m[3], 10);
    const ap = String(m[4] || "").toUpperCase();

    if (ap === "PM" && hh < 12) hh += 12;
    if (ap === "AM" && hh === 12) hh = 0;

    base.setHours(hh, mm, 0, 0);
    return base;
  }

  function parseData(valor, baseRef) {
    if (!valor) return null;

    // Parser intencionalmente conservador:
    // não aceita "May 5" pelo Date nativo como ano 2001.
    // Quando o Oracle manda mês/dia sem ano, usamos o ano do Gerado_em/baseRef.
    let s = String(valor)
      .replace(/\u00A0/g, " ")
      .trim()
      .replace(/^"|"$/g, "")
      .trim();
    if (!s) return null;

    s = s.replace(/\s+/g, " ");

    const base = baseRef ? parseData(baseRef) : null;
    const anoBase = base && !isNaN(base) ? base.getFullYear() : new Date().getFullYear();

    const dRel = parseDataRelativa(s, baseRef);
    if (dRel) return dRel;

    // ISO vindo do CSV: 2026-05-05 ou 2026-05-05 13:36:55
    let mIso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (mIso) {
      const d = new Date(
        parseInt(mIso[1], 10),
        parseInt(mIso[2], 10) - 1,
        parseInt(mIso[3], 10),
        parseInt(mIso[4] || "0", 10),
        parseInt(mIso[5] || "0", 10),
        parseInt(mIso[6] || "0", 10)
      );
      if (!isNaN(d)) return d;
    }

    // Brasil: 05/05/2026, 05-05-2026 ou 05/05/2026 13:36:55
    const mBr = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (mBr) {
      const dia = parseInt(mBr[1], 10);
      const mes = parseInt(mBr[2], 10) - 1;
      let ano = parseInt(mBr[3], 10);
      if (ano < 100) ano += 2000;
      const d = new Date(ano, mes, dia, parseInt(mBr[4] || "0", 10), parseInt(mBr[5] || "0", 10), parseInt(mBr[6] || "0", 10));
      if (!isNaN(d)) return d;
    }

    const meses = {
      jan:0, january:0, janeiro:0,
      feb:1, february:1, fevereiro:1, fev:1,
      mar:2, march:2, março:2, marco:2,
      apr:3, april:3, abril:3, abr:3,
      may:4, maio:4, mai:4,
      jun:5, june:5, junho:5,
      jul:6, july:6, julho:6,
      aug:7, august:7, agosto:7, ago:7,
      sep:8, sept:8, september:8, setembro:8, set:8,
      oct:9, october:9, outubro:9, out:9,
      nov:10, november:10, novembro:10,
      dec:11, december:11, dezembro:11, dez:11
    };

    function montarData(ano, mes, dia, hh, mm, ss, ap) {
      let h = parseInt(hh || "0", 10);
      const m = parseInt(mm || "0", 10);
      const sec = parseInt(ss || "0", 10);
      const ampm = String(ap || "").toUpperCase();
      if (ampm === "PM" && h < 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      const d = new Date(ano, mes, dia, h, m, sec);
      return isNaN(d) ? null : d;
    }

    // Oracle: May 5, 2026 / May 5 / May 5, 1:26 PM / Maio 5, 2026
    const mMesDia = s.match(/^([A-Za-zÀ-ÿçÇ]+)\s+(\d{1,2})(?:,)?(?:\s+(\d{4}))?(?:,)?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
    if (mMesDia) {
      const mon = meses[String(mMesDia[1] || "").toLowerCase()];
      if (mon !== undefined) {
        const ano = mMesDia[3] ? parseInt(mMesDia[3], 10) : anoBase;
        const d = montarData(ano, mon, parseInt(mMesDia[2], 10), mMesDia[4], mMesDia[5], mMesDia[6], mMesDia[7]);
        if (d) return d;
      }
    }

    // Oracle/Excel: 5 May 2026 / 5-May-2026 / 5/Mai/2026 / 5 May
    const mDiaMes = s.match(/^(\d{1,2})[\s\/-]([A-Za-zÀ-ÿçÇ]+)(?:[\s\/-](\d{4}))?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
    if (mDiaMes) {
      const mon = meses[String(mDiaMes[2] || "").toLowerCase()];
      if (mon !== undefined) {
        const ano = mDiaMes[3] ? parseInt(mDiaMes[3], 10) : anoBase;
        const d = montarData(ano, mon, parseInt(mDiaMes[1], 10), mDiaMes[4], mDiaMes[5], mDiaMes[6], mDiaMes[7]);
        if (d) return d;
      }
    }

    // Último recurso: só aceita Date nativo se houver ano explícito,
    // para não transformar "May 5" em 2001 e excluir do ano do dashboard.
    if (/\b\d{4}\b/.test(s)) {
      const d = new Date(s);
      if (!isNaN(d)) return d;
    }

    return null;
  }

  function isFechado(status) {
    const st = String(status || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    return st.includes("closed") ||
      st.includes("close requested") ||
      st.includes("resolved") ||
      st.includes("resolvido") ||
      st.includes("fechado") ||
      st.includes("fechamento solicitado");
  }

  function mesmoAno(dt, ano) {
    return !ano || (dt && dt.getFullYear() === Number(ano));
  }

  function primeiroValor(row, campos) {
    for (const campo of campos) {
      const valor = row?.[campo];
      if (valor !== undefined && valor !== null && String(valor).trim() !== "") return valor;
    }
    return "";
  }

  function dataAbertura(row, baseRef) {
    return parseData(primeiroValor(row, ["Criado_dt", "Created", "Criado", "created_at"]), baseRef);
  }

  function dataFechamento(row, baseRef) {
    if (!isFechado(row?.["Status"])) return null;
    return parseData(primeiroValor(row, ["Closed", "Fechado"]), baseRef) ||
      parseData(primeiroValor(row, ["Atualizado_dt", "Updated", "updated_at"]), baseRef) ||
      dataAbertura(row, baseRef) ||
      parseData(primeiroValor(row, ["Gerado em", "Gerado_em"]), baseRef);
  }

  function numeroSR(row) {
    return String(primeiroValor(row, [
      "Número SR",
      "Numero SR",
      "SR Number",
      "Service Request",
      "SR",
      "numero_sr"
    ])).trim();
  }

  function chaveSR(row) {
    return numeroSR(row).toUpperCase().replace(/\s+/g, "");
  }

  function dataAtualizacao(row, baseRef) {
    return parseData(primeiroValor(row, ["Atualizado_dt", "Updated", "updated_at"]), baseRef) ||
      parseData(primeiroValor(row, ["Gerado em", "Gerado_em"]), baseRef) ||
      dataFechamento(row, baseRef) ||
      dataAbertura(row, baseRef);
  }

  function deduplicarSRs(rows, baseRef) {
    const unicos = new Map();

    (rows || []).forEach(row => {
      const chave = chaveSR(row);
      if (!chave) return;

      const anterior = unicos.get(chave);
      if (!anterior) {
        unicos.set(chave, row);
        return;
      }

      const dataAnterior = dataAtualizacao(anterior, baseRef);
      const dataAtual = dataAtualizacao(row, baseRef);
      const tempoAnterior = dataAnterior ? dataAnterior.getTime() : -Infinity;
      const tempoAtual = dataAtual ? dataAtual.getTime() : -Infinity;

      if (tempoAtual > tempoAnterior ||
          (tempoAtual === tempoAnterior && isFechado(row?.["Status"]) && !isFechado(anterior?.["Status"]))) {
        unicos.set(chave, row);
      }
    });

    return [...unicos.values()];
  }

  function normalizarDados(rows, ano) {
    const anoNumero = Number(ano) || null;
    const referenciaCSV = extrairUltimoValorAtualizacao(rows);
    const baseRef = referenciaCSV || (anoNumero ? `${anoNumero}-12-31` : "");
    const unicos = deduplicarSRs(rows, baseRef);

    if (!anoNumero) return unicos;

    return unicos.filter(row => {
      const abertura = dataAbertura(row, baseRef);
      if (abertura) return abertura.getFullYear() === anoNumero;

      const anoRegistro = Number(row?.ano ?? row?.["Ano"] ?? row?.["ANO"]);
      return anoRegistro === anoNumero;
    });
  }

  function calcularSeriesMensais(rows, ano) {
    const criados = Array(12).fill(0);
    const abertos = Array(12).fill(0);
    const fechados = Array(12).fill(0);
    const semDataAbertura = [];
    const semDataFechamento = [];

    const normalizados = normalizarDados(rows, ano);
    const baseRef = extrairUltimoValorAtualizacao(normalizados) || (ano ? `${ano}-12-31` : "");

    normalizados.forEach(row => {
      const da = dataAbertura(row, baseRef);
      if (!da || !mesmoAno(da, ano)) {
        semDataAbertura.push(row);
        return;
      }

      const mes = da.getMonth();
      criados[mes]++;
      if (isFechado(row?.["Status"])) fechados[mes]++;
      else abertos[mes]++;
    });

    return { abertos, criados, fechados, semDataAbertura, semDataFechamento };
  }

  function calcularKPIs(rows, ano) {
    const normalizados = normalizarDados(rows, ano);
    const total = normalizados.length;
    const fechados = normalizados.filter(r => isFechado(r?.["Status"])).length;
    return { total, abertos: total - fechados, fechados };
  }

  function contarPorCampo(rows, campo) {
    const mapa = {};
    (rows || []).forEach(item => {
      const v = String(item?.[campo] || "").trim() || "Não informado";
      mapa[v] = (mapa[v] || 0) + 1;
    });
    return mapa;
  }

  function extrairUltimoValorAtualizacao(rows) {
    if (!rows || !rows.length) return "";
    const normaliza = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/_/g, " ");
    const nomesAceitos = ["gerado em", "atualizado em", "gerado_em", "atualizado_em"].map(normaliza);
    const chaves = Object.keys(rows[0] || {});
    const chave = chaves.find(k => nomesAceitos.includes(normaliza(k)));
    if (!chave) return "";

    for (let i = rows.length - 1; i >= 0; i--) {
      const v = rows[i][chave];
      if (v && String(v).trim()) return String(v).trim();
    }
    return "";
  }

  function nomeMesAno(dt) {
    const nome = dt.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }

  window.SRMetrics = {
    MESES,
    parseCSV,
    parseData,
    isFechado,
    numeroSR,
    deduplicarSRs,
    normalizarDados,
    dataAbertura,
    dataFechamento,
    calcularSeriesMensais,
    calcularKPIs,
    contarPorCampo,
    extrairUltimoValorAtualizacao,
    nomeMesAno
  };
})();
