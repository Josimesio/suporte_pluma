
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
  const headers = lines[0].replace(/^\uFEFF/, "").split(",");
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const obj = {};
    headers.forEach((h, idx) => obj[h.trim()] = (cols[idx] || "").replace(/^"|"$/g, "").trim());
    data.push(obj);
  }
  return data;
}

function contarAbertosFechados(dados) {
  return window.SRMetrics.calcularKPIs(dados);
}

async function carregarGraficoComparativoAnos() {
  const [csv2025, csv2026] = await Promise.all([
    fetch("dados/dados_sr_2025.csv").then(r => r.text()),
    fetch("dados/dados_sr_2026.csv").then(r => r.text())
  ]);

  const d2025 = contarAbertosFechados(window.SRMetrics.normalizarDados(parseCSV(csv2025), 2025));
  const d2026 = contarAbertosFechados(window.SRMetrics.normalizarDados(parseCSV(csv2026), 2026));

  const ctx = document.getElementById("graficoComparativoAnos");
  if (!ctx) return;

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Abertos", "Fechados"],
      datasets: [
        { label: "2025", data: [d2025.abertos, d2025.fechados] },
        { label: "2026", data: [d2026.abertos, d2026.fechados] }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}

carregarGraficoComparativoAnos();
