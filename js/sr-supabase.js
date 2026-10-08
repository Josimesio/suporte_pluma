(function () {
  "use strict";
  async function client() { await window.plumaAuthPronto; return window.obterClienteSupabase(); }
  const fields = "id,origem_revisao,linha_origem,numero_sr,valores,aging_calculado,versao,atualizado_em,atualizado_por,atualizado_nome,atualizado_email";
  function errorMessage(error) {
    if (["42P01", "42703", "PGRST204", "PGRST205", "PGRST202"].includes(error.code)) {
      return "Confira a instalação v10 no Supabase: execute sql/ATUALIZAR_ABAS_LOGS_V10.sql para atualizar a SR já instalada, ou sql/INSTALAR_SR_VERSIONADA.sql para instalação nova.";
    }
    return error.message || "Não foi possível acessar a SR no Supabase.";
  }
  window.PlumaSRBanco = {
    async carregar(revision) {
      const supabase = await client(), rows = [], size = 1000;
      for (let start = 0; ; start += size) {
        const { data, error } = await supabase.from("sr_planilha_registros").select(fields)
          .eq("origem_revisao", revision).order("linha_origem").range(start, start + size - 1);
        if (error) throw new Error(errorMessage(error));
        rows.push(...(data || []));
        if (!data || data.length < size) return rows;
      }
    },
    async salvar(row, changes, aba = "sr") {
      if (!window.usuarioPodeEditarPlanilhas?.()) throw new Error("Somente Administrador e Gestor podem editar e salvar a SR.");
      if (!row.dbId || !Number.isInteger(row.version)) throw new Error("Registro sem identificação ou versão do banco.");
      const supabase = await client();
      const { data, error } = await supabase.rpc("salvar_sr_planilha_com_log", {
        p_registro_id: row.dbId, p_versao_atual: row.version, p_alteracoes: changes, p_aba: aba
      });
      if (error) throw new Error(errorMessage(error));
      const result = Array.isArray(data) ? data[0] : data;
      if (!result || result.id !== row.dbId || !Number.isInteger(result.versao) || !Array.isArray(result.valores) || result.valores.length !== 25) {
        throw new Error("O banco não confirmou o salvamento. Recarregue os dados antes de tentar novamente.");
      }
      return result;
    },
    async historico(id, offset = 0) {
      const supabase = await client();
      const { data, error } = await supabase.from("sr_planilha_versoes")
        .select("id,registro_id,versao,valores,alteracoes,acao,usuario_id,usuario_nome,usuario_email,alterado_em")
        .eq("registro_id", id).order("versao", { ascending: false }).range(offset, offset + 19);
      if (error) throw new Error(errorMessage(error));
      return data || [];
    }
  };
})();
