(async function () {
  if (!await window.plumaAuthPronto) return;
  try {
    await window.atualizarPermissoesAbas();
    const oracle = window.usuarioPodeRealizarCarga("oracle");
    const gtn = window.usuarioPodeRealizarCarga("gtn");
    document.getElementById("cargaOracle").hidden = !oracle;
    document.getElementById("cargaGtn").hidden = !gtn;
    const aviso = document.getElementById("avisoCargas");
    aviso.textContent = oracle || gtn ? "Selecione o arquivo para realizar uma das cargas autorizadas abaixo." : "Você não possui permissão para realizar cargas. Solicite a liberação ao administrador.";
    aviso.className = `alert alert-${oracle || gtn ? "info" : "warning"}`;
  } catch (erro) {
    document.getElementById("avisoCargas").textContent = `Não foi possível conferir as permissões: ${erro.message}`;
  }
})();
