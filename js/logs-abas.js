(function () {
  "use strict";
  function atual() {
    return document.querySelector('[data-sr-tab][aria-selected="true"]')?.dataset.srTab || "painel";
  }
  function registrar() {
    // Compatibilidade com as telas existentes, sem chamadas ao banco.
    return Promise.resolve(false);
  }
  async function permitir(aba, ano) {
    try {
      await window.plumaAuthPronto;
      await window.atualizarPermissoesAbas();
      const perfil = window.perfilAtual();
      const permitido = window.usuarioPodeVisualizarAba(aba) && (ano == null ||
        perfil.perfil === "administrador" || perfil.permissoes?.[`chamados_${Number(ano)}`] === true);
      if (!permitido) {
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
