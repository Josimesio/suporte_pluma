/* top-contatos.js - Página: top-contatos.html */

(function () {
  if (window.Chart && window.ChartDataLabels) Chart.register(ChartDataLabels);

  const statusBox = document.getElementById("statusBox");
  const uploadBox = document.getElementById("uploadBox");
  const fileInput = document.getElementById("fileInput");

  let chartTop = null;

  function parseCSV(texto) {
    const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== "");
    if (!linhas.length) return [];

    const cabecalho = linhas[0].split(",").map(h => h.trim());
    if (cabecalho[0]) cabecalho[0] = cabecalho[0].replace(/^\uFEFF/, "");

    const dados = [];
    for (let i = 1; i < linhas.length; i++) {
      const cols = linhas[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      const obj = {};
      for (let j = 0; j < cabecalho.length; j++) {
        obj[cabecalho[j]] = (cols[j] || "").replace(/^"|"$/g, "").trim();
      }
      if (Object.values(obj).some(v => String(v || "").trim() !== "")) dados.push(obj);
    }
    return dados;
  }

  function setAtualizadoEm(dados) {
    const el = document.getElementById("atualizadoEm");
    if (!el) return;
    const col = "Gerado em";
    const v = (dados && dados.length && dados[0] && dados[0][col]) ? String(dados[0][col]).trim() : "";
    el.textContent = v || "-";
  }

  function contarPorCampo(lista, campo) {
    const mapa = {};
    lista.forEach(item => {
      const v = (item[campo] || "").trim() || "Não informado";
      mapa[v] = (mapa[v] || 0) + 1;
    });
    return mapa;
  }

  function topN(mapa, n = 10) {
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]).slice(0, n);
  }

  function render(dados) {
    if (!Array.isArray(dados) || !dados.length) {
      statusBox.className = "alert alert-warning py-2 mb-0";
      statusBox.innerHTML = "CSV carregou, mas veio sem linhas válidas. Selecione o CSV abaixo.";
      uploadBox?.classList.remove("d-none");
      return;
    }

    setAtualizadoEm(dados);

    const coluna = "Contato Primário";
    if (!(coluna in dados[0])) {
      statusBox.className = "alert alert-danger py-2 mb-0";
      statusBox.innerHTML = "Não encontrei a coluna <b>Contato Primário</b> no CSV.";
      uploadBox?.classList.remove("d-none");
      return;
    }

    const totalSR = dados.length;
    const contagem = contarPorCampo(dados, coluna);
    const contatosUnicos = Object.keys(contagem).length;

    const top = topN(contagem, 10);
    const top1 = top[0]?.[0] || "-";
    const top1Qtd = top[0]?.[1] || 0;

    document.getElementById("kpiTotal").textContent = totalSR;
    document.getElementById("kpiContatos").textContent = contatosUnicos;
    document.getElementById("kpiTop1").textContent = top1;
    document.getElementById("kpiTop1Qtd").textContent = top1Qtd;

    const tb = document.getElementById("tabelaTopContatos");
    tb.innerHTML = "";
    top.forEach(([contato, qtd], idx) => {
      const pct = totalSR ? ((qtd / totalSR) * 100).toFixed(1) : "0.0";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${idx + 1}</td><td>${contato}</td><td>${qtd}</td><td>${pct}%</td>`;
      tb.appendChild(tr);
    });

    const labels = top.map(x => x[0]);
    const valores = top.map(x => x[1]);

    const canvas = document.getElementById("graficoTopContatos");
    if (chartTop) chartTop.destroy();

    chartTop = new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ data: valores, backgroundColor: "#006E51", borderRadius: 4 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: { color: "#000", anchor: "end", align: "top", font: { weight: "bold", size: 10 } }
        },
        scales: { y: { beginAtZero: true, precision: 0 } }
      }
    });

    statusBox.className = "alert alert-success py-2 mb-0";
    statusBox.innerHTML = `Dados carregados ✅ Total SRs: <b>${totalSR}</b>`;
    uploadBox?.classList.add("d-none");
  }

  async function tentarFetch() {
    try {
      const resp = await fetch("dados_sr.csv", { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const texto = await resp.text();
      render(parseCSV(texto));
    } catch (e) {
      statusBox.className = "alert alert-danger py-2 mb-0";
      statusBox.innerHTML = `Falha ao carregar <b>dados_sr.csv</b> via fetch. Motivo: <b>${e.message}</b>`;
      uploadBox?.classList.remove("d-none");
    }
  }

  fileInput?.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const texto = await file.text();
    render(parseCSV(texto));
  });

  tentarFetch();
})();
