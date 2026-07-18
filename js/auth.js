(function () {
  "use strict";

  if (window.__PLUMA_AUTH_CARREGADO__) return;
  window.__PLUMA_AUTH_CARREGADO__ = true;

  const PAGINA_LOGIN = "login.html";
  let cliente = null;
  let usuarioSessao = null;
  let perfilSessao = null;
  let acessoRegistrado = false;

  function paginaAtual() {
    return window.location.pathname.split("/").pop() || "index.html";
  }

  function ehPaginaAutenticacao() {
    return /^(login|redefinir-senha|mfa)\.html$/i.test(paginaAtual());
  }

  function ocultarPagina() {
    if (!ehPaginaAutenticacao()) document.documentElement.style.visibility = "hidden";
  }

  function exibirPagina() {
    document.documentElement.style.visibility = "visible";
  }

  function carregarScript(src) {
    return new Promise((resolve, reject) => {
      const existente = document.querySelector(`script[src="${src}"]`);
      if (existente) {
        if (window.supabase) return resolve();
        existente.addEventListener("load", resolve, { once: true });
        existente.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Não foi possível carregar a autenticação."));
      document.head.appendChild(script);
    });
  }

  async function iniciarCliente() {
    if (cliente) return cliente;

    if (!window.PLUMA_SUPABASE_CONFIG) {
      await carregarScript("js/supabase-config.js");
    }
    if (!window.supabase) {
      await carregarScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
    }

    const cfg = window.PLUMA_SUPABASE_CONFIG;
    if (!cfg?.url || !cfg?.publishableKey) {
      throw new Error("Configuração do Supabase não encontrada.");
    }

    cliente = window.supabase.createClient(cfg.url, cfg.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return cliente;
  }

  async function carregarSessao() {
    const supabase = await iniciarCliente();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    usuarioSessao = data.session?.user || null;
    if (!usuarioSessao) {
      perfilSessao = null;
      return null;
    }

    const { data: perfil, error: erroPerfil } = await supabase
      .from("perfis_usuarios")
      .select("id,nome,email,perfil,ativo,ultimo_acesso_em,permissoes,mfa_obrigatorio,mfa_configurado_em")
      .eq("id", usuarioSessao.id)
      .single();

    if (erroPerfil && /permissoes/i.test(erroPerfil.message || "")) {
      const tentativa = await supabase
        .from("perfis_usuarios")
        .select("id,nome,email,perfil,ativo,ultimo_acesso_em,mfa_obrigatorio,mfa_configurado_em")
        .eq("id", usuarioSessao.id)
        .single();
      if (tentativa.error) throw new Error("Perfil de acesso não localizado.");
      tentativa.data.permissoes = {};
      perfilSessao = tentativa.data;
      aplicarPermissoesNaInterface();
      if (ehPaginaAutenticacao()) return data.session;
      if (!validarPermissaoPagina()) return data.session;
      registrarVisualizacao();
      await carregarCabecalho();
      return data.session;
    }
    if (erroPerfil) throw new Error("Perfil de acesso não localizado.");
    perfilSessao = perfil;
    aplicarPermissoesNaInterface();
    if (ehPaginaAutenticacao()) return data.session;
    if (!validarPermissaoPagina()) return data.session;
    registrarVisualizacao();
    await carregarCabecalho();
    return data.session;
  }

  async function registrarVisualizacao() {
    if (acessoRegistrado || ehPaginaAutenticacao() || !perfilSessao?.ativo) return;
    acessoRegistrado = true;
    try {
      const supabase = await iniciarCliente();
      const { error } = await supabase.rpc("registrar_acesso_portal", {
        p_pagina: paginaAtual(),
        p_titulo: document.title || paginaAtual()
      });
      if (error && !/registrar_acesso_portal|schema cache|function/i.test(error.message || "")) {
        console.warn("Não foi possível registrar a visualização:", error.message);
      }
    } catch (erro) {
      console.warn("Registro de visualização indisponível:", erro);
    }
  }

  function aplicarPermissoesNaInterface() {
    const aplicar = () => {
      document.querySelectorAll("[data-requer-permissao]").forEach(elemento => {
        const chave = elemento.dataset.requerPermissao;
        const permitido = perfilSessao?.perfil === "administrador" || perfilSessao?.permissoes?.[chave] === true;
        elemento.hidden = !permitido;
      });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", aplicar, { once: true });
    } else {
      aplicar();
    }
  }

  function validarPermissaoPagina() {
    if (!perfilSessao || perfilSessao.perfil === "administrador") return true;
    const arquivo = paginaAtual();
    const chaves = {
      "index.html": "inicio",
      "index_2025.html": "chamados_2025", "graficos_2025.html": "graficos_2025",
      "top-modulos_2025.html": "top_modulos_2025", "top-contatos_2025.html": "top_contatos_2025", "sla_2025.html": "sla_2025",
      "index_2026.html": "chamados_2026", "graficos_2026.html": "graficos_2026",
      "top-modulos_2026.html": "top_modulos_2026", "top-contatos_2026.html": "top_contatos_2026", "sla_2026.html": "sla_2026",
      "graficos.html": "graficos_2026", "top-modulos.html": "top_modulos_2026", "top-contatos.html": "top_contatos_2026",
      "sr-corte.html": "sr_corte"
    };
    if (arquivo === "admin_acessos.html" || !chaves[arquivo]) {
      alert("Você não possui permissão para acessar esta página.");
      window.location.replace("index.html");
      return false;
    }
    if (arquivo !== "index.html" && perfilSessao.permissoes?.[chaves[arquivo]] !== true) {
      alert("Você não possui permissão para acessar esta página.");
      window.location.replace("index.html");
      return false;
    }
    return true;
  }

  async function carregarCabecalho() {
    if (!window.aplicarCabecalhoPadronizado) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "js/cabecalho.js?v=20260718-6";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Não foi possível carregar o cabeçalho."));
        document.head.appendChild(script);
      });
    }
    window.aplicarCabecalhoPadronizado(perfilSessao);
  }

  async function obterNivelMfa() {
    const supabase = await iniciarCliente();
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data;
  }

  async function destinoAposLogin() {
    if (!perfilSessao?.mfa_obrigatorio) return "index.html";

    const nivel = await obterNivelMfa();
    return nivel?.currentLevel === "aal2" ? "index.html" : "mfa.html";
  }

  async function mfaEstaValidado() {
    if (!perfilSessao?.mfa_obrigatorio) return true;
    const nivel = await obterNivelMfa();
    return nivel?.currentLevel === "aal2";
  }

  async function fazerLogin(email, senha) {
    try {
      const supabase = await iniciarCliente();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: String(email || "").trim(),
        password: String(senha || "")
      });

      if (error) {
        return { sucesso: false, erro: "credenciais", mensagem: "E-mail ou senha inválidos." };
      }

      usuarioSessao = data.user;
      await carregarSessao();
      if (!perfilSessao?.ativo) {
        await supabase.auth.signOut();
        return { sucesso: false, erro: "inativo", mensagem: "Usuário inativo. Procure o administrador." };
      }

      return {
        sucesso: true,
        perfil: perfilSessao,
        destino: await destinoAposLogin()
      };
    } catch (erro) {
      console.error("Falha no login:", erro);
      return { sucesso: false, erro: "sistema", mensagem: erro.message || "Falha ao acessar o serviço de autenticação." };
    }
  }

  async function fazerLogout() {
    try {
      const supabase = await iniciarCliente();
      await supabase.auth.signOut();
    } finally {
      usuarioSessao = null;
      perfilSessao = null;
      window.location.replace(PAGINA_LOGIN);
    }
  }

  async function protegerPagina(destinoLogin = PAGINA_LOGIN) {
    try {
      const sessao = await carregarSessao();
      if (!sessao || !perfilSessao?.ativo) {
        if (sessao) await cliente.auth.signOut();
        window.location.replace(destinoLogin);
        return false;
      }

      if (!(await mfaEstaValidado())) {
        const atual = paginaAtual();
        if (atual && atual !== "mfa.html") {
          sessionStorage.setItem(
            "pluma_destino_pos_mfa",
            atual + window.location.search + window.location.hash
          );
        }
        window.location.replace("mfa.html");
        return false;
      }

      exibirPagina();
      return true;
    } catch (erro) {
      console.error("Falha ao validar acesso:", erro);
      window.location.replace(destinoLogin);
      return false;
    }
  }

  async function protegerPaginaAdminAcessos(destinoSemPermissao = "index.html") {
    const autenticado = await protegerPagina(PAGINA_LOGIN);
    if (!autenticado) return false;

    if (perfilSessao?.perfil !== "administrador") {
      alert("Acesso restrito aos administradores.");
      window.location.replace(destinoSemPermissao);
      return false;
    }
    return true;
  }

  function usuarioAtual() {
    return perfilSessao?.email || usuarioSessao?.email || "";
  }

  function perfilAtual() {
    return perfilSessao;
  }

  function usuarioEhAdminAcessos() {
    return perfilSessao?.perfil === "administrador" && perfilSessao?.ativo === true;
  }

  async function obterClienteSupabase() {
    return iniciarCliente();
  }

  async function limparSessao() {
    const supabase = await iniciarCliente();
    await supabase.auth.signOut();
    usuarioSessao = null;
    perfilSessao = null;
  }

  window.fazerLogin = fazerLogin;
  window.fazerLogout = fazerLogout;
  window.protegerPagina = protegerPagina;
  window.protegerPaginaAdminAcessos = protegerPaginaAdminAcessos;
  window.usuarioAtual = usuarioAtual;
  window.perfilAtual = perfilAtual;
  window.usuarioEhAdminAcessos = usuarioEhAdminAcessos;
  window.obterClienteSupabase = obterClienteSupabase;
  window.obterNivelMfa = obterNivelMfa;
  window.limparSessao = limparSessao;

  ocultarPagina();
  window.plumaAuthPronto = ehPaginaAutenticacao()
    ? iniciarCliente().then(exibirPagina).catch(erro => {
        console.error(erro);
        exibirPagina();
      })
    : protegerPagina(PAGINA_LOGIN);
})();
