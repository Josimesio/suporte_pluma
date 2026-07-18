/**
 * index_Principal - Navegação + Gráfico comparativo anual
 *
 * Navegação "à prova de pastas":
 * tenta localizar as páginas 2025/2026 em diferentes caminhos comuns
 * (raiz, pasta por ano, nomes com sufixo/underscore).
 *
 * Gráfico:
 *  - lê dados_sr_2025.csv e dados_sr_2026.csv (padrão do projeto)
 *  - calcula Abertos/Fechados e plota com valores em cima das barras
 */

// ---------- Navegação inteligente (corrige links quebrados) ----------
async function encontrarPrimeiroOk(candidatos) {
  for (const url of candidatos) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) return url;
    } catch (_) {}
  }
  return null;
}

function candidatosPagina(ano, pagina) {
  // pagina: index | graficos | top-modulos | top-contatos
  const baseName = pagina; // já vem no formato correto
  const html1 = `${ano}/${baseName}.html`;
  const html2 = `${ano}/${baseName}.htm`;
  const html3 = `${baseName}-${ano}.html`;
  const html4 = `${baseName}_${ano}.html`;
  const html5 = `${baseName}${ano}.html`;
  const html6 = `${baseName}.html`; // fallback (caso esteja tudo na raiz)
  return [html1, html2, html3, html4, html5, html6].map(u => u.replace("//","/"));
}

async function irPara(ano, pagina) {
  const candidatos = candidatosPagina(ano, pagina);
  const ok = await encontrarPrimeiroOk(candidatos);
  if (ok) {
    window.location.href = ok;
  } else {
    alert(
      `Não encontrei a página "${pagina}" do ano ${ano}.\n\n` +
      `Caminhos testados:\n- ` + candidatos.join("\n- ")
    );
  }
}

// ---------- CSV + SLA básico de status ----------
function parseCSV(text) {
  const lines = String(text || "").split(/\r?\n/).filter(l => l.trim() !== "");
  if (!lines.length) return [];

  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = headerLine.split(",").map(h => h.trim());

  const splitCSV = (line) => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSV(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      obj[key] = (cols[j] || "").replace(/^"|"$/g, "").trim();
    }
    if (Object.values(obj).some(v => v && String(v).trim() !== "")) data.push(obj);
  }
  return data;
}

function contarAbertosFechados(rows) {
  let fechados = 0;
  (rows || []).forEach(r => {
    const st = (r["Status"] || "").toLowerCase();
    if (st.includes("closed") || st.includes("resolved")) fechados++;
  });
  return { abertos: (rows || []).length - fechados, fechados };
}

function normalizarChaveAtualizacao(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

function parseAtualizacao(valor) {
  const s = String(valor || "").trim();
  if (!s) return null;

  let d = new Date(s.replace(" ", "T"));
  if (!isNaN(d)) return d;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    d = new Date(
      parseInt(m[3], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[1], 10),
      parseInt(m[4] || "0", 10),
      parseInt(m[5] || "0", 10),
      0
    );
    if (!isNaN(d)) return d;
  }

  return null;
}

function formatarAtualizacao(d) {
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function obterAtualizacaoMaisRecente(...listas) {
  const nomesAceitos = new Set(["gerado em", "atualizado em"]);
  let melhorData = null;
  let melhorTexto = "";

  listas.forEach(lista => {
    (lista || []).forEach(row => {
      Object.keys(row || {}).forEach(chave => {
        if (!nomesAceitos.has(normalizarChaveAtualizacao(chave))) return;

        const valor = String(row[chave] || "").trim();
        if (!valor) return;

        const data = parseAtualizacao(valor);
        if (data && (!melhorData || data > melhorData)) {
          melhorData = data;
          melhorTexto = formatarAtualizacao(data);
        } else if (!melhorData) {
          melhorTexto = valor;
        }
      });
    });
  });

  return melhorTexto;
}

function atualizarCabecalhoPrincipal(...listas) {
  const el = document.getElementById("atualizadoEmPrincipal");
  if (!el) return;
  el.textContent = obterAtualizacaoMaisRecente(...listas) || "-";
}

function msg(html, tipo="warning") {
  const el = document.getElementById("msgComparativo");
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${tipo} py-2 mb-0">${html}</div>`;
}

function perfilPodeVer(perfil, permissao) {
  return perfil?.perfil === "administrador" || perfil?.permissoes?.[permissao] === true;
}

async function aplicarPermissoesPaginaInicial() {
  if (window.plumaAuthPronto) await window.plumaAuthPronto;
  const perfil = typeof window.perfilAtual === "function" ? window.perfilAtual() : null;
  if (!perfil) return;

  document.querySelectorAll("[data-permissao]").forEach(elemento => {
    elemento.hidden = !perfilPodeVer(perfil, elemento.dataset.permissao);
  });

  document.querySelectorAll("[data-grupo-ano]").forEach(grupo => {
    const possuiOpcao = [...grupo.querySelectorAll("[data-permissao]")].some(elemento => !elemento.hidden);
    grupo.hidden = !possuiOpcao;
  });
}

// Plugin nativo para escrever valores em cima das barras
const plumaValueLabels = {
  id: "plumaValueLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "#111";

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;

      meta.data.forEach((bar, index) => {
        const value = dataset.data[index];
        if (value === null || value === undefined) return;
        ctx.fillText(String(value), bar.x, bar.y - 6);
      });
    });

    ctx.restore();
  }
};

async function carregarComparativo() {
  try {
    const [t25, t26] = await Promise.all([
      fetch("dados/dados_sr_2025.csv", { cache: "no-store" }).then(r => {
        if (!r.ok) throw new Error("Não encontrei os dados na raiz do site.");
        return r.text();
      }),
      fetch("dados/dados_sr_2026.csv", { cache: "no-store" }).then(r => {
        if (!r.ok) throw new Error("Não encontrei os dados na raiz do site.");
        return r.text();
      })
    ]);

    const d25 = parseCSV(t25);
    const d26 = parseCSV(t26);

    atualizarCabecalhoPrincipal(d25, d26);

    const anosDisponiveis = [];
    if (d25.length) anosDisponiveis.push({ ano: 2025, contagem: contarAbertosFechados(d25) });
    if (d26.length) anosDisponiveis.push({ ano: 2026, contagem: contarAbertosFechados(d26) });

    if (!anosDisponiveis.length) {
      const canvas = document.getElementById("graficoComparativoAnos");
      if (canvas) canvas.closest("div").hidden = true;
      msg("Seu perfil não possui acesso aos dados de 2025 ou 2026.", "info");
      return;
    }

    const canvas = document.getElementById("graficoComparativoAnos");
    if (!canvas) return;

    if (window.__plumaChartComparativo) window.__plumaChartComparativo.destroy();

    window.__plumaChartComparativo = new Chart(canvas, {
      type: "bar",
      data: {
        labels: ["Abertos", "Fechados"],
        datasets: anosDisponiveis.map(item => ({
          label: String(item.ano),
          data: [item.contagem.abertos, item.contagem.fechados]
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top" } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      },
      plugins: [plumaValueLabels]
    });

    document.getElementById("tituloComparativo").textContent = `📊 Abertos/Fechados — ${anosDisponiveis.map(item => item.ano).join(" x ")}`;
    msg(anosDisponiveis.map(item =>
      `${item.ano}: <b>${item.contagem.abertos}</b> abertos / <b>${item.contagem.fechados}</b> fechados`
    ).join(" • "), "success");
  } catch (e) {
    console.warn(e);
    msg(e.message, "warning");
  }
}

aplicarPermissoesPaginaInicial();

carregarComparativo();
