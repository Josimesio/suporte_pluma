(function () {
  "use strict";
  const abas = new Set(["planilha", "sr", "consolidado"]);
  let fila = Promise.resolve();
  function atual() {
    return document.querySelector('[data-sr-tab][aria-selected="true"]')?.dataset.srTab || "painel";
  }
  function registrar(aba, acao, dados = {}) {
    if (!abas.has(aba)) return Promise.resolve(false);
    const tarefa = fila.then(async () => {
      await window.plumaAuthPronto;
      const sb = await window.obterClienteSupabase();
      const { error } = await sb.rpc("registrar_evento_aba_portal", {
        p_aba: aba, p_acao: acao, p_ano: dados.ano == null ? null : Number(dados.ano),
        p_quantidade: dados.quantidade == null ? null : Number(dados.quantidade),
        p_referencia: dados.referencia == null ? null : String(dados.referencia).slice(0, 120),
        p_detalhes: { pagina: location.pathname.split("/").pop() || "index.html", ...(dados.detalhes || {}) }
      });
      if (error) throw new Error(error.message || "Log indisponível.");
      return true;
    }).catch(error => {
      console.warn("Não foi possível registrar o evento da aba:", error.message);
      return false;
    });
    fila = tarefa;
    return tarefa;
  }
  async function permitir(aba, ano) {
    try {
      await window.plumaAuthPronto;
      await window.atualizarPermissoesAbas();
      const perfil = window.perfilAtual();
      const permitido = window.usuarioPodeVisualizarAba(aba) && (ano == null ||
        perfil.perfil === "administrador" || perfil.permissoes?.[`chamados_${Number(ano)}`] === true);
      if (!permitido) {
        void registrar(aba, "acesso_bloqueado", { ano, detalhes: { motivo: "Permissão de visualização não concedida" } });
        return false;
      }
      return true;
    } catch (error) {
      console.warn("Não foi possível conferir o acesso à aba:", error.message);
      return false;
    }
  }
  window.PlumaAbas = { atual, permitir, registrar };
})();
