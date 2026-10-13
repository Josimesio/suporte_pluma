-- SUPORTE ORACLE — V16: remover apenas os logs de Planilha, SR e Consolidado.
-- Executar TODO este arquivo no SQL Editor do projeto Supabase do portal.
-- Apaga os logs existentes. Mantém dados, permissões, autoria, importações
-- e todos os históricos de versões (inclusive coluna × linha e comentários).
-- Execute por último se reaplicar SQLs das versões anteriores.

begin;

-- As funções de registro permanecem compatíveis com navegadores antigos,
-- mas não consultam nem gravam qualquer tabela.
create or replace function sr_planilha_interno.registrar_evento_aba(
  p_aba text, p_acao text, p_ano integer, p_quantidade integer,
  p_referencia text, p_detalhes jsonb
) returns uuid language sql security invoker set search_path = '' as $sem_evento$
  select null::uuid;
$sem_evento$;

create or replace function public.registrar_evento_aba_portal(
  p_aba text, p_acao text, p_ano integer default null,
  p_quantidade integer default null, p_referencia text default null,
  p_detalhes jsonb default '{}'::jsonb
) returns uuid language sql security invoker set search_path = '' as $sem_evento$
  select null::uuid;
$sem_evento$;

revoke execute on function
  sr_planilha_interno.registrar_evento_aba(text,text,integer,integer,text,jsonb),
  public.registrar_evento_aba_portal(text,text,integer,integer,text,jsonb)
  from public, anon;
grant execute on function
  sr_planilha_interno.registrar_evento_aba(text,text,integer,integer,text,jsonb),
  public.registrar_evento_aba_portal(text,text,integer,integer,text,jsonb)
  to authenticated;

-- Retira somente o INSERT no log das definições efetivamente instaladas.
-- Mantém o restante do corpo, inclusive validações de acesso e INSERTs
-- nos históricos de versões. Não substitui funções por uma versão antiga.
do $remover_gravacao$
declare
  assinatura text;
  funcao regprocedure;
  definicao text;
  sem_log text;
begin
  foreach assinatura in array array[
    'sr_planilha_interno.auditar_permissoes_abas()',
    'sr_planilha_interno.auditar_salvamento_aba()',
    'sr_planilha_interno.versionar_comentarios()',
    'sr_planilha_interno.aplicar_carga(jsonb,text,text)'
  ] loop
    funcao := pg_catalog.to_regprocedure(assinatura);
    if funcao is null then continue; end if;
    definicao := pg_catalog.pg_get_functiondef(funcao);
    sem_log := pg_catalog.regexp_replace(
      definicao,
      'insert[[:space:]]+into[[:space:]]+public[.]logs_abas_portal[[:space:]]*[(][^;]*;',
      '', 'gi'
    );
    if sem_log is distinct from definicao then
      execute sem_log;
    end if;
    if sem_log ~* 'logs_abas_portal' then
      raise exception 'A função % contém uma referência ao log não reconhecida. Nenhuma alteração foi aplicada.', assinatura;
    end if;
  end loop;
end;
$remover_gravacao$;

-- Esses dois gatilhos atendem exclusivamente ao log. Os gatilhos que
-- validam dados e registram versões permanecem instalados.
drop trigger if exists zz_portal_log_sr on public.sr_planilha_registros;
drop trigger if exists zz_portal_log_planilha on public.chamados_oracle;

-- O gatilho de permissões permanece: além de registrar eventos na versão
-- antiga, também impede alterações de visualização por não administradores.
-- Seu INSERT no log foi retirado acima; a validação permanece integralmente.

-- Se houver outra função gravando nesta tabela, interrompe a transação
-- em vez de deixar um salvamento quebrar depois da remoção da tabela.
do $conferir_gravadores$
declare restante text;
begin
  select pg_catalog.string_agg(p.oid::regprocedure::text, ', ')
    into restante
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'sr_planilha_interno')
    and p.prosrc ~* 'insert[[:space:]]+into[[:space:]]+(public[.])?logs_abas_portal';
  if restante is not null then
    raise exception 'Ainda existem funções gravando no log: %. Nenhuma alteração foi aplicada.', restante;
  end if;
end;
$conferir_gravadores$;

-- Sem CASCADE: nenhuma dependência imprevista será removida.
-- DROP libera o espaço da tabela de logs e de seus índices.
drop table if exists public.logs_abas_portal;

notify pgrst, 'reload schema';
commit;

-- Verificação: logs_removidos deve retornar true; funções gravadoras, zero.
select
  pg_catalog.to_regclass('public.logs_abas_portal') is null as logs_removidos,
  (select count(*) from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'sr_planilha_interno')
     and p.prosrc ~* 'insert[[:space:]]+into[[:space:]]+(public[.])?logs_abas_portal') as funcoes_gravando_logs,
  pg_catalog.to_regclass('public.sr_planilha_versoes') is not null as historico_sr_preservado,
  pg_catalog.to_regclass('public.chamados_oracle_versoes') is not null as historico_planilha_preservado,
  pg_catalog.to_regclass('public.sr_consolidado_comentarios_versoes') is not null as historico_comentarios_preservado,
  pg_catalog.to_regclass('public.consolidado_celulas_versoes') is not null as historico_celulas_preservado;
