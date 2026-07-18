(function () {
  "use strict";

  const anoPagina = Number((document.title.match(/20\d{2}/) || [])[0]);
  let botaoEnvio = null;

  function mensagem(texto, tipo) {
    const caixa = document.getElementById("mensagemSolicitacaoAnalitico");
    if (!caixa) return;
    caixa.className = `alert alert-${tipo || "info"} py-2 mb-0`;
    caixa.textContent = texto;
    caixa.hidden = false;
  }

  function limparMensagem() {
    const caixa = document.getElementById("mensagemSolicitacaoAnalitico");
    if (caixa) caixa.hidden = true;
  }

  async function abrirSolicitacaoAnalitico(numeroSr) {
    limparMensagem();
    const perfil = typeof perfilAtual === "function" ? perfilAtual() : null;
    document.getElementById("analiticoEmail").value = perfil?.email || (typeof usuarioAtual === "function" ? usuarioAtual() : "");
    document.getElementById("analiticoNumeroSr").value = String(numeroSr || "").trim();
    document.getElementById("analiticoMotivo").value = "";
    const modal = document.getElementById("modalSolicitacaoAnalitico");
    if (!modal) {
      alert("O formulário de solicitação não foi encontrado nesta página. Atualize todos os arquivos do portal.");
      return;
    }
    if (typeof modal.showModal === "function") modal.showModal();
    else modal.setAttribute("open", "");
    setTimeout(() => document.getElementById("analiticoNumeroSr")?.focus(), 250);
  }

  function fecharSolicitacaoAnalitico() {
    const modal = document.getElementById("modalSolicitacaoAnalitico");
    if (!modal) return;
    if (typeof modal.close === "function") modal.close();
    else modal.removeAttribute("open");
  }

  async function enviarSolicitacaoAnalitico(evento) {
    evento.preventDefault();
    const numeroSr = document.getElementById("analiticoNumeroSr").value.trim();
    const motivo = document.getElementById("analiticoMotivo").value.trim();
    const perfil = typeof perfilAtual === "function" ? perfilAtual() : null;

    if (!numeroSr) return mensagem("Informe o número do chamado.", "warning");
    if (!motivo) return mensagem("Explique brevemente por que precisa do analítico.", "warning");
    if (!anoPagina) return mensagem("Não foi possível identificar o ano desta página.", "danger");

    botaoEnvio = document.getElementById("btnEnviarSolicitacaoAnalitico");
    botaoEnvio.disabled = true;
    botaoEnvio.textContent = "Enviando...";

    try {
      const supabase = await obterClienteSupabase();
      const { data: usuario, error: erroUsuario } = await supabase.auth.getUser();
      if (erroUsuario || !usuario.user) throw new Error("Sua sessão não foi localizada. Entre novamente.");

      const { error } = await supabase.from("solicitacoes_analitico").insert({
        solicitante_id: usuario.user.id,
        solicitante_email: perfil?.email || usuario.user.email,
        solicitante_nome: perfil?.nome || usuario.user.email,
        numero_sr: numeroSr,
        ano: anoPagina,
        motivo
      });
      if (error) throw error;

      mensagem("Solicitação enviada à TI. A resposta será encaminhada ao seu e-mail.", "success");
      document.getElementById("analiticoNumeroSr").value = "";
      document.getElementById("analiticoMotivo").value = "";
      setTimeout(fecharSolicitacaoAnalitico, 1800);
    } catch (erro) {
      const duplicada = /duplicate|unique|pendente/i.test(erro.message || "");
      mensagem(duplicada ? "Já existe uma solicitação pendente deste chamado para o seu usuário." : `Não foi possível enviar: ${erro.message}`, "danger");
    } finally {
      botaoEnvio.disabled = false;
      botaoEnvio.textContent = "Enviar solicitação";
    }
  }

  window.abrirSolicitacaoAnalitico = abrirSolicitacaoAnalitico;
  window.fecharSolicitacaoAnalitico = fecharSolicitacaoAnalitico;
  window.enviarSolicitacaoAnalitico = enviarSolicitacaoAnalitico;
})();
