-- Execute no SQL Editor do Supabase do portal Pluma após a instalação V13.
-- Restringe a consulta dos históricos ao administrador ativo.
-- As políticas de consulta dos dados atuais e de edição permanecem iguais.
-- Os gatilhos continuam registrando as alterações de Administrador/Gestor.

begin;

do $historico$
declare
  v_tabela text;
begin
  if to_regprocedure('public.eh_administrador()') is null then
    raise exception 'A função eh_administrador() não foi encontrada. Confira o projeto do portal Pluma.';
  end if;

  foreach v_tabela in array array[
    'consolidado_celulas_versoes',
    'sr_planilha_versoes',
    'chamados_oracle_versoes',
    'sr_consolidado_comentarios_versoes'
  ] loop
    if to_regclass(format('public.%I', v_tabela)) is null then
      raise exception 'Tabela % não encontrada. Confira a instalação V13. Nenhuma alteração foi aplicada.', v_tabela;
    end if;

    execute format('alter table public.%I enable row level security', v_tabela);
    execute format('drop policy if exists historico_apenas_administrador on public.%I', v_tabela);
    execute format(
      'create policy historico_apenas_administrador on public.%I as restrictive for select to authenticated using ((select public.eh_administrador()))',
      v_tabela
    );
  end loop;
end;
$historico$;

notify pgrst, 'reload schema';

commit;

-- Deve retornar quatro linhas RESTRICTIVE / SELECT, uma por tabela.
select tablename, policyname, permissive, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and policyname = 'historico_apenas_administrador'
  and tablename in (
    'consolidado_celulas_versoes', 'sr_planilha_versoes',
    'chamados_oracle_versoes', 'sr_consolidado_comentarios_versoes'
  )
order by tablename;
