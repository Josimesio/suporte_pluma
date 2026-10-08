(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const nomes = { planilha: "Planilha", sr: "SR", consolidado: "Consolidado" };
  const acoes = { acesso: "Visualização", exportacao: "Exportação Excel", exportacao_original: "Exportação original", historico: "Consulta de histórico", recarregamento: "Recarregamento", salvamento: "Salvamento", permissao: "Alteração de permissão", erro: "Falha", acesso_bloqueado: "Acesso bloqueado" };
  let pagina = 1, total = 0, ticket = 0, ocupado = false;
  function mensagem(texto, tipo = "info") {
    $("mensagemLogsAbas").textContent = texto;
    $("mensagemLogsAbas").className = `alert alert-${tipo} py-2 mb-3`;
  }
  function filtros(q) {
    const dias = Number($("periodoAnalytics").value);
    if (dias) q = q.gte("registrado_em", new Date(Date.now() - dias * 86400000).toISOString());
    if ($("filtroLogsAba").value) q = q.eq("aba", $("filtroLogsAba").value);
    if ($("filtroLogsAcao").value) q = q.eq("acao", $("filtroLogsAcao").value);
    if ($("filtroLogsUsuario").value) q = q.eq("usuario_id", $("filtroLogsUsuario").value);
    return q;
  }
  function controles() {
    for (const id of ["filtroLogsAba", "filtroLogsAcao", "filtroLogsUsuario", "tamanhoLogsAbas", "atualizarLogsAbas"]) $(id).disabled = ocupado;
    $("logsAbasAnterior").disabled = ocupado || pagina <= 1;
    $("logsAbasProxima").disabled = ocupado || pagina * Number($("tamanhoLogsAbas").value) >= total;
  }
  function celula(linha, texto, secundario) {
    const td = linha.insertCell(); td.textContent = texto == null ? "—" : String(texto);
    if (secundario) { const small = document.createElement("small"); small.className = "d-block text-muted"; small.textContent = secundario; td.append(small); }
    return td;
  }
  function detalhes(row) {
    const d = row.detalhes || {};
    if (row.acao === "permissao") return `${d.nome_alvo || d.email_alvo || "Usuário"}: ${d.antes ? "permitida" : "bloqueada"} → ${d.depois ? "permitida" : "bloqueada"}`;
    const partes = [];
    if (d.versao) partes.push(`Versão ${d.versao}`);
    if (Array.isArray(d.campos)) partes.push(`${d.campos.length} campo(s) alterado(s)`);
    if (Number(d.pendentes)) partes.push(`${d.pendentes} linha(s) pendente(s) incluída(s)`);
    if (d.tipo) partes.push(d.tipo);
    if (d.motivo) partes.push(d.motivo);
    return partes.join(" • ") || "—";
  }
  function renderizar(rows) {
    const body = $("tbodyLogsAbas"); body.replaceChildren();
    for (const row of rows) {
      const tr = body.insertRow();
      celula(tr, new Date(row.registrado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), "Brasília");
      celula(tr, row.usuario_nome || row.usuario_email, row.usuario_email);
      celula(tr, row.perfil);
      celula(tr, nomes[row.aba]);
      celula(tr, acoes[row.acao], row.origem === "banco" ? "Confirmado pelo banco" : "Evento da tela");
      celula(tr, row.acao === "permissao" ? row.detalhes?.email_alvo || "—" : row.referencia || "—", row.ano ? String(row.ano) : "");
      celula(tr, row.quantidade == null ? "—" : row.quantidade);
      celula(tr, detalhes(row));
    }
    if (!rows.length) { const td = body.insertRow().insertCell(); td.colSpan = 8; td.className = "text-center text-muted py-4"; td.textContent = "Nenhum evento encontrado com estes filtros."; }
    const size = Number($("tamanhoLogsAbas").value);
    $("logsAbasFaixa").textContent = total ? `${(pagina - 1) * size + 1}–${Math.min(pagina * size, total)} de ${total} eventos` : "0 eventos";
    $("logsAbasPagina").textContent = `Página ${pagina} de ${Math.max(1, Math.ceil(total / size))}`;
  }
  async function carregar(reset = false) {
    if (reset) pagina = 1;
    const atual = ++ticket; ocupado = true; controles(); mensagem("Consultando os registros das abas...");
    try {
      if (!await window.protegerPaginaAdminAcessos("index.html")) return;
      const sb = await window.obterClienteSupabase(), size = Number($("tamanhoLogsAbas").value);
      const contar = acao => {
        let q = filtros(sb.from("logs_abas_portal").select("id", { count: "exact", head: true }));
        if (acao) q = q.eq("acao", acao);
        return q;
      };
      const query = filtros(sb.from("logs_abas_portal").select("id,usuario_id,usuario_nome,usuario_email,perfil,aba,acao,origem,ano,referencia,quantidade,detalhes,registrado_em", { count: "exact" }))
        .order("registrado_em", { ascending: false }).order("id", { ascending: false }).range((pagina - 1) * size, pagina * size - 1);
      const resultados = await Promise.all([query, contar("acesso"), contar("exportacao"), contar("exportacao_original"), contar("salvamento")]);
      if (atual !== ticket) return;
      const falha = resultados.find(r => r.error);
      if (falha) throw new Error(falha.error.message);
      total = resultados[0].count || 0;
      if (pagina > 1 && !resultados[0].data?.length && total) { pagina = Math.max(1, Math.ceil(total / size)); return await carregar(); }
      $("kpiEventosAbas").textContent = total.toLocaleString("pt-BR");
      $("kpiVisualizacoesAbas").textContent = (resultados[1].count || 0).toLocaleString("pt-BR");
      $("kpiExportacoesAbas").textContent = ((resultados[2].count || 0) + (resultados[3].count || 0)).toLocaleString("pt-BR");
      $("kpiSalvamentosAbas").textContent = (resultados[4].count || 0).toLocaleString("pt-BR");
      renderizar(resultados[0].data || []);
      mensagem("Registros consultados. Salvamentos e alterações de permissão são confirmados pelo banco.", "success");
    } catch (error) {
      if (atual !== ticket) return;
      total = 0; renderizar([]);
      for (const id of ["kpiEventosAbas", "kpiVisualizacoesAbas", "kpiExportacoesAbas", "kpiSalvamentosAbas"]) $(id).textContent = "—";
      mensagem(`Não foi possível consultar os logs: ${error.message}. Confira a instalação de sql/ATUALIZAR_ABAS_LOGS_V10.sql.`, "danger");
    } finally { if (atual === ticket) { ocupado = false; controles(); } }
  }
  async function iniciar() {
    if (!await window.protegerPaginaAdminAcessos("index.html")) return;
    const sb = await window.obterClienteSupabase();
    const { data, error } = await sb.from("perfis_usuarios").select("id,nome,email").order("nome");
    if (!error) for (const p of data || []) $("filtroLogsUsuario").add(new Option(`${p.nome || p.email} (${p.email || ""})`, p.id));
    await carregar();
  }
  for (const id of ["filtroLogsAba", "filtroLogsAcao", "filtroLogsUsuario", "tamanhoLogsAbas", "periodoAnalytics"]) $(id).addEventListener("change", () => { void carregar(true); });
  $("atualizarLogsAbas").addEventListener("click", () => { void carregar(true); });
  $("logsAbasAnterior").addEventListener("click", () => { pagina--; void carregar(); });
  $("logsAbasProxima").addEventListener("click", () => { pagina++; void carregar(); });
  window.PlumaLogsAnalitico = { carregar };
  void iniciar().catch(error => { mensagem(`Não foi possível iniciar a consulta dos logs: ${error.message}`, "danger"); });
})();
