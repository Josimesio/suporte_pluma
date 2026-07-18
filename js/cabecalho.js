(function () {
  "use strict";

  if (window.__PLUMA_CABECALHO_CARREGADO__) return;
  window.__PLUMA_CABECALHO_CARREGADO__ = true;

  const paginas = {
    "index.html": { titulo: "Suporte ORACLE", chave: "inicio" },
    "index_2025.html": { titulo: "Chamados 2025 - ORACLE", chave: "chamados_2025" },
    "graficos_2025.html": { titulo: "Gráficos dos Chamados 2025 - ORACLE", chave: "graficos_2025" },
    "top-modulos_2025.html": { titulo: "Top Módulos 2025 - ORACLE", chave: "top_modulos_2025" },
    "top-contatos_2025.html": { titulo: "Top Contatos 2025 - ORACLE", chave: "top_contatos_2025" },
    "sla_2025.html": { titulo: "SLA dos Chamados 2025 - ORACLE", chave: "sla_2025" },
    "index_2026.html": { titulo: "Chamados 2026 - ORACLE", chave: "chamados_2026" },
    "graficos_2026.html": { titulo: "Gráficos dos Chamados 2026 - ORACLE", chave: "graficos_2026" },
    "top-modulos_2026.html": { titulo: "Top Módulos 2026 - ORACLE", chave: "top_modulos_2026" },
    "top-contatos_2026.html": { titulo: "Top Contatos 2026 - ORACLE", chave: "top_contatos_2026" },
    "sla_2026.html": { titulo: "SLA dos Chamados 2026 - ORACLE", chave: "sla_2026" },
    "sr-corte.html": { titulo: "Painel de SR por Período - ORACLE", chave: "sr_corte" },
    "admin_acessos.html": { titulo: "Administração de Acessos", chave: "administracao" },
    "admin_analitico.html": { titulo: "Analítico do Portal", chave: "administracao" },
    "graficos.html": { titulo: "Gráficos 2026 - ORACLE", chave: "graficos_2026" },
    "top-modulos.html": { titulo: "Top Módulos 2026 - ORACLE", chave: "top_modulos_2026" },
    "top-contatos.html": { titulo: "Top Contatos 2026 - ORACLE", chave: "top_contatos_2026" }
  };

  const navegacao = [
    { grupo: "Principal", itens: [
      { chave: "inicio", href: "index.html", label: "🏠 Início" },
      { chave: "sr_corte", href: "sr-corte.html", label: "📌 SR Período" }
    ]},
    { grupo: "2025", itens: [
      { chave: "chamados_2025", href: "index_2025.html", label: "📄 Chamados" },
      { chave: "graficos_2025", href: "graficos_2025.html", label: "📊 Gráficos" },
      { chave: "top_modulos_2025", href: "top-modulos_2025.html", label: "🧩 Módulos" },
      { chave: "top_contatos_2025", href: "top-contatos_2025.html", label: "👤 Contatos" },
      { chave: "sla_2025", href: "sla_2025.html", label: "⏱ SLA" }
    ]},
    { grupo: "2026", itens: [
      { chave: "chamados_2026", href: "index_2026.html", label: "📄 Chamados" },
      { chave: "graficos_2026", href: "graficos_2026.html", label: "📊 Gráficos" },
      { chave: "top_modulos_2026", href: "top-modulos_2026.html", label: "🧩 Módulos" },
      { chave: "top_contatos_2026", href: "top-contatos_2026.html", label: "👤 Contatos" },
      { chave: "sla_2026", href: "sla_2026.html", label: "⏱ SLA" }
    ]}
  ];

  function paginaAtual() {
    return window.location.pathname.split("/").pop() || "index.html";
  }

  function nomePerfil(perfil) {
    return ({ administrador: "Administrador", analista: "Analista", gestor: "Gestor", consulta: "Consulta" })[perfil] || "Consulta";
  }

  function podeVer(perfil, chave) {
    if (perfil?.perfil === "administrador") return true;
    if (chave === "inicio") return true;
    return perfil?.permissoes?.[chave] === true;
  }

  function escapar(valor) {
    const elemento = document.createElement("span");
    elemento.textContent = valor == null ? "" : String(valor);
    return elemento.innerHTML;
  }

  function inserirEstilos() {
    if (document.getElementById("pl-cabecalho-estilos")) return;
    const estilo = document.createElement("style");
    estilo.id = "pl-cabecalho-estilos";
    estilo.textContent = `
      .pl-header.pl-header-unico { position: sticky; top: 0; z-index: 1030; min-height: 0 !important;
        height: auto !important; flex: 0 0 auto !important; padding: 10px 0 !important; overflow: visible !important;
        background: #003f35 !important; border-bottom: 3px solid #f2c700; color: #fff; }
      .app-wrapper.pl-layout-suporte { height: auto !important; min-height: 100vh !important; overflow: visible !important; }
      .pl-header-unico .pl-head-grid { display: grid; grid-template-columns: minmax(290px, .9fr) minmax(620px, 1.6fr);
        align-items: center; gap: 18px; }
      .pl-header-unico .pl-head-grid.pl-head-com-acao { grid-template-columns: minmax(300px,.95fr) minmax(280px,.75fr) minmax(520px,1.35fr); }
      .pl-header-unico .pl-head-info { min-width: 0; }
      .pl-header-unico h1 { margin: 0; color: #fff; font-size: clamp(1.35rem, 1.8vw, 1.9rem); line-height: 1.15; }
      .pl-header-unico .pl-subtitulo { margin: 3px 0 0; color: rgba(255,255,255,.85); font-size: .82rem; }
      .pl-header-unico .pl-atualizado { margin-top: 5px; color: #ffe066; font-size: .75rem; font-weight: 700; }
      .pl-usuario-logado { display: inline-flex; align-items: center; gap: 7px; margin-bottom: 7px; padding: 5px 10px;
        border: 1px solid rgba(255,255,255,.35); border-radius: 999px; background: rgba(0,0,0,.2); color: #fff;
        font-size: .75rem; line-height: 1; }
      .pl-usuario-perfil { padding: 4px 8px; border-radius: 999px; background: #f2c700; color: #172f2b;
        font-size: .65rem; font-weight: 800; text-transform: uppercase; }
      .pl-head-direita { display: flex; align-items: center; justify-content: flex-end; gap: 12px; min-width: 0; }
      .pl-head-acao { display:flex; align-items:center; justify-content:center; min-width:0; }
      .pl-btn-analitico { width:100%; max-width:430px; min-height:58px; display:flex; align-items:center; justify-content:center;
        gap:9px; padding:10px 18px; border:2px solid #f2c700; border-radius:12px; background:#f2c700; color:#172f2b;
        font-size:.9rem; font-weight:800; box-shadow:0 5px 14px rgba(0,0,0,.2); }
      .pl-btn-analitico:hover, .pl-btn-analitico:focus { background:#ffe05b; border-color:#ffe05b; color:#172f2b; transform:translateY(-1px); }
      #modalSolicitacaoAnalitico::backdrop { background:rgba(0,34,29,.72); }
      #modalSolicitacaoAnalitico { overflow:hidden; background:#f7faf9; border:1px solid rgba(0,63,53,.18) !important;
        border-top:6px solid #f2c700 !important; color:#18302c; }
      #modalSolicitacaoAnalitico .modal-content { border:0; border-radius:0; background:#f7faf9; box-shadow:none; }
      #modalSolicitacaoAnalitico .modal-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px;
        padding:20px 24px 17px; border:0; background:linear-gradient(135deg,#003f35,#087866); color:#fff; }
      #modalSolicitacaoAnalitico .modal-title { display:flex; align-items:center; gap:10px; margin:0; color:#fff;
        font-size:1.18rem !important; font-weight:800; line-height:1.25; }
      #modalSolicitacaoAnalitico .modal-title::before { content:"📨"; display:grid; place-items:center; width:38px; height:38px;
        border-radius:10px; background:#f2c700; color:#172f2b; font-size:1.05rem; box-shadow:0 3px 8px rgba(0,0,0,.18); }
      #modalSolicitacaoAnalitico .btn-close { flex:0 0 auto; margin:2px 0 0; padding:7px; border-radius:50%;
        background-color:#fff; opacity:.9; }
      #modalSolicitacaoAnalitico .btn-close:hover { opacity:1; transform:scale(1.05); }
      #modalSolicitacaoAnalitico .modal-body { padding:22px 24px 12px; }
      #modalSolicitacaoAnalitico .analitico-orientacao { margin:-2px 0 20px; padding:11px 13px; border-left:4px solid #f2c700;
        border-radius:0 8px 8px 0; background:#fff7cf; color:#4d4a2c; font-size:.82rem; line-height:1.45; }
      #modalSolicitacaoAnalitico .form-label { margin-bottom:6px; color:#003f35; font-size:.82rem; font-weight:800; }
      #modalSolicitacaoAnalitico .form-control { min-height:44px; border:1px solid #b9cbc7; border-radius:9px;
        background:#fff; color:#18302c; font-size:.9rem; box-shadow:none; }
      #modalSolicitacaoAnalitico textarea.form-control { min-height:108px; resize:vertical; }
      #modalSolicitacaoAnalitico .form-control:focus { border-color:#087866; box-shadow:0 0 0 3px rgba(8,120,102,.16); }
      #modalSolicitacaoAnalitico .form-control[readonly] { background:#eaf2f0; color:#536864; cursor:not-allowed; }
      #modalSolicitacaoAnalitico .modal-footer { display:flex; justify-content:flex-end; gap:10px; padding:14px 24px 22px;
        border:0; background:#f7faf9; }
      #modalSolicitacaoAnalitico .modal-footer .btn { min-height:43px; padding:8px 18px; border-radius:9px; font-size:.85rem; font-weight:750; }
      #modalSolicitacaoAnalitico #btnEnviarSolicitacaoAnalitico { border-color:#087866; background:#087866; color:#fff; }
      #modalSolicitacaoAnalitico #btnEnviarSolicitacaoAnalitico:hover { border-color:#005f50; background:#005f50; }
      #modalSolicitacaoAnalitico .btn-outline-secondary { border-color:#78908b; color:#405c56; background:#fff; }
      #modalSolicitacaoAnalitico .alert { border-radius:8px; font-size:.82rem; }
      .pl-nav-unica { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex: 1; }
      .pl-nav-grupo { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 5px; }
      .pl-nav-rotulo { min-width: 58px; color: #f2c700; font-size: .67rem; font-weight: 800; text-align: right; text-transform: uppercase; }
      .pl-nav-unica .btn { padding: 4px 8px; border: 1px solid #d8e1df; background: #fff; color: #18302c;
        font-size: .72rem; font-weight: 650; line-height: 1.25; white-space: nowrap; box-shadow: none; }
      .pl-nav-unica .btn:hover, .pl-nav-unica .btn:focus { background: #e8f4f1; color: #003f35; }
      .pl-nav-unica .btn.pl-ativo { background: #f2c700; border-color: #f2c700; color: #172f2b; }
      .pl-head-marca { display: flex; flex-direction: column; align-items: center; gap: 6px; }
      .pl-head-marca img { display: block; width: 52px; max-height: 42px; object-fit: contain; }
      .pl-head-marca .btn { padding: 4px 9px; font-size: .72rem; white-space: nowrap; }
      @media (max-width: 1100px) {
        .pl-header-unico .pl-head-grid, .pl-header-unico .pl-head-grid.pl-head-com-acao { grid-template-columns: 1fr; }
        .pl-head-acao { justify-content:flex-start; }
        .pl-head-direita, .pl-nav-unica { justify-content: flex-start; align-items: flex-start; }
        .pl-nav-grupo { justify-content: flex-start; }
        .pl-nav-rotulo { text-align: left; }
        .pl-head-marca { flex-direction: row; }
      }
      @media (max-width: 620px) {
        .pl-head-direita { align-items: flex-start; }
        .pl-nav-rotulo { width: 100%; min-width: 0; }
        .pl-head-marca img { display: none; }
        #modalSolicitacaoAnalitico .modal-header { padding:17px 18px 14px; }
        #modalSolicitacaoAnalitico .modal-body { padding:18px 18px 8px; }
        #modalSolicitacaoAnalitico .modal-footer { padding:12px 18px 18px; }
        #modalSolicitacaoAnalitico .modal-footer .btn { flex:1; padding-inline:10px; }
      }
    `;
    document.head.appendChild(estilo);
  }

  function elementoAtualizacao(arquivo) {
    if (arquivo === "index.html") return '<span id="atualizadoEmPrincipal">-</span>';
    if (["top-contatos.html", "top-modulos.html"].includes(arquivo)) return '<span id="lblAtualizacaoValor">-</span>';
    return '<span id="atualizadoEm">-</span>';
  }

  function montarNavegacao(perfil, arquivo) {
    const grupos = navegacao.map(grupo => {
      const botoes = grupo.itens.filter(item => podeVer(perfil, item.chave)).map(item =>
        `<a class="btn ${item.href === arquivo ? "pl-ativo" : ""}" href="${item.href}">${item.label}</a>`
      ).join("");
      if (!botoes) return "";
      return `<div class="pl-nav-grupo"><span class="pl-nav-rotulo">${grupo.grupo}</span>${botoes}</div>`;
    }).join("");

    const admin = perfil?.perfil === "administrador"
      ? `<div class="pl-nav-grupo"><span class="pl-nav-rotulo">Admin</span><a class="btn ${arquivo === "admin_acessos.html" ? "pl-ativo" : ""}" href="admin_acessos.html">👥 Acessos</a><a class="btn ${arquivo === "admin_analitico.html" ? "pl-ativo" : ""}" href="admin_analitico.html">📈 Analítico</a></div>`
      : "";
    return grupos + admin;
  }

  function ehPaginaChamados(arquivo) {
    return arquivo === "index_2025.html" || arquivo === "index_2026.html";
  }

  function montarAcaoCabecalho(arquivo) {
    if (!ehPaginaChamados(arquivo)) return "";
    return `<div class="pl-head-acao">
      <button type="button" class="pl-btn-analitico" id="plBtnSolicitarAnalitico">📨 Solicitar analítico do chamado</button>
    </div>`;
  }

  function aplicarCabecalho(perfil) {
    const executar = () => {
      const cabecalho = document.querySelector("header.pl-header");
      if (!cabecalho) return;

      inserirEstilos();
      const arquivo = paginaAtual();
      const pagina = paginas[arquivo] || { titulo: "Suporte ORACLE", chave: "inicio" };
      const referenciaAtualizacao = ["atualizadoEm", "atualizadoEmPrincipal", "lblAtualizacaoValor"]
        .map(id => document.getElementById(id)).find(Boolean) || null;
      cabecalho.closest(".app-wrapper")?.classList.add("pl-layout-suporte");
      cabecalho.className = "pl-header pl-header-unico";
      cabecalho.innerHTML = `
        <div class="container-fluid px-3">
          <div class="pl-head-grid ${ehPaginaChamados(arquivo) ? "pl-head-com-acao" : ""}">
            <div class="pl-head-info">
              <div class="pl-usuario-logado"><span>👤</span><strong>${escapar(perfil?.nome || perfil?.email || "Usuário")}</strong>
                <span class="pl-usuario-perfil">${nomePerfil(perfil?.perfil)}</span></div>
              <h1>${pagina.titulo}</h1>
              <p class="pl-subtitulo">Programa Conecta • Grupo Pluma</p>
              <div class="pl-atualizado">Atualizado em: ${elementoAtualizacao(arquivo)}</div>
            </div>
            ${montarAcaoCabecalho(arquivo)}
            <div class="pl-head-direita">
              <nav class="pl-nav-unica" aria-label="Navegação principal">${montarNavegacao(perfil, arquivo)}</nav>
              <div class="pl-head-marca">
                <img src="img/logo-conecta.png" alt="Programa Conecta">
                <button type="button" class="btn btn-sm btn-outline-light" id="plBtnSair">🚪 Sair</button>
              </div>
            </div>
          </div>
        </div>`;
      if (referenciaAtualizacao) {
        const novoAlvo = cabecalho.querySelector(`#${referenciaAtualizacao.id}`);
        if (novoAlvo) novoAlvo.replaceWith(referenciaAtualizacao);
      }
      cabecalho.querySelector("#plBtnSair").addEventListener("click", () => window.fazerLogout());
      cabecalho.querySelector("#plBtnSolicitarAnalitico")?.addEventListener("click", () => {
        if (typeof window.abrirSolicitacaoAnalitico === "function") window.abrirSolicitacaoAnalitico();
        else alert("O formulário de solicitação ainda não foi carregado. Atualize a página e tente novamente.");
      });
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", executar, { once: true });
    else executar();
  }

  window.aplicarCabecalhoPadronizado = aplicarCabecalho;
})();
