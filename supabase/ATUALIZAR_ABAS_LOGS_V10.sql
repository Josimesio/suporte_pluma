-- ATUALIZAÇÃO V10. Cole TODO o arquivo em uma consulta nova do SQL Editor.
-- Preserva dados, versões e permissões já configuradas.
begin;
-- V9: Administrador/Gestor, autoria e datas por campo.
-- Projeto do portal: vsnvhaojeiegzfrfvmps.
-- Abra uma consulta nova, cole TODO o arquivo, Ctrl+A dentro do editor e Run.
-- Requer a instalação da SR feita anteriormente. Não apaga registros nem versões.

do $sr_requisitos$
begin
  if to_regclass('public.sr_planilha_registros') is null or to_regclass('public.sr_planilha_versoes') is null then
    raise exception 'Instale primeiro a SR usando sql/INSTALAR_SR_VERSIONADA.sql.';
  end if;
  if to_regclass('public.chamados_oracle') is null or to_regclass('public.perfis_usuarios') is null then
    raise exception 'Projeto incorreto: tabelas do portal não encontradas.';
  end if;
end;
$sr_requisitos$;

alter table public.sr_planilha_registros add column if not exists atualizado_nome text;
alter table public.sr_planilha_registros add column if not exists atualizado_email text;
alter table public.sr_planilha_versoes add column if not exists usuario_nome text;

create or replace function sr_planilha_interno.pode_editar()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.perfis_usuarios p
    where p.id = (select auth.uid()) and p.ativo is true and p.perfil in ('administrador', 'gestor')
      and sr_planilha_interno.pode_consultar()
      and (coalesce(p.mfa_obrigatorio, false) is false or (select auth.jwt() ->> 'aal') = 'aal2')
  );
$$;

create or replace function sr_planilha_interno.validar_registro()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  i integer;
begin
  if jsonb_typeof(new.valores) <> 'array' or jsonb_array_length(new.valores) <> 25 then
    raise exception 'O registro deve conter os 25 campos da SR.';
  end if;
  for i in 0..24 loop
    if jsonb_typeof(new.valores -> i) not in ('string', 'number', 'boolean', 'null') then
      raise exception 'Campo % com tipo inválido.', i;
    end if;
  end loop;
  if btrim(new.valores ->> 2) is distinct from new.numero_sr then
    raise exception 'O número da SR não pode ser alterado.';
  end if;
  if tg_op = 'UPDATE' then
    if auth.uid() is null or not sr_planilha_interno.pode_editar() then
      raise exception using errcode = '42501', message = 'Somente Administrador e Gestor ativos podem editar e salvar a SR.';
    end if;
    if new.id is distinct from old.id or new.origem_revisao is distinct from old.origem_revisao
      or new.linha_origem is distinct from old.linha_origem or new.numero_sr is distinct from old.numero_sr
      or new.aging_calculado is distinct from old.aging_calculado or new.criado_em is distinct from old.criado_em
      or new.valores -> 2 is distinct from old.valores -> 2 then
      raise exception 'A identificação e a origem da SR permanecem fixas.';
    end if;
    if old.aging_calculado and new.valores -> 9 is distinct from old.valores -> 9 then
      raise exception 'Aging é calculado e não pode ser editado nesta linha.';
    end if;
    if new.valores = old.valores then return null; end if;
    new.versao := old.versao + 1;
  else
    new.versao := 1;
  end if;
  new.atualizado_em := clock_timestamp();
  new.atualizado_por := auth.uid();
  if auth.uid() is not null then
    select p.nome, p.email into new.atualizado_nome, new.atualizado_email
    from public.perfis_usuarios p where p.id = auth.uid() and p.ativo is true;
  else
    new.atualizado_nome := null; new.atualizado_email := null;
  end if;
  return new;
end;
$$;

create or replace function public.salvar_sr_planilha(
  p_registro_id uuid, p_versao_atual integer, p_alteracoes jsonb
)
returns public.sr_planilha_registros
language plpgsql security invoker set search_path = ''
as $$
declare
  registro public.sr_planilha_registros;
  novos_valores jsonb;
  item record;
  coluna integer;
begin
  if auth.uid() is null or not sr_planilha_interno.pode_editar() then
    raise exception using errcode = '42501', message = 'Somente Administrador e Gestor ativos podem editar e salvar a SR.';
  end if;
  if p_alteracoes is null or jsonb_typeof(p_alteracoes) <> 'object' or p_alteracoes = '{}'::jsonb then
    raise exception 'Informe os campos alterados.';
  end if;
  select * into registro from public.sr_planilha_registros where id = p_registro_id for update;
  if not found then raise exception 'Registro não encontrado ou sem permissão de acesso.'; end if;
  if p_versao_atual is null or registro.versao <> p_versao_atual then
    raise exception using errcode = 'P0001', message = 'Conflito de versão. Outra pessoa alterou esta linha. Recarregue e revise seus rascunhos antes de salvar.';
  end if;
  novos_valores := registro.valores;
  for item in select * from jsonb_each(p_alteracoes) loop
    if item.key !~ '^(0|[1-9]|1[0-9]|2[0-4])$' then raise exception 'Coluna inválida.'; end if;
    coluna := item.key::integer;
    if coluna = 2 or (coluna = 9 and registro.aging_calculado) then raise exception 'Campo fixo ou calculado.'; end if;
    if jsonb_typeof(item.value) not in ('string', 'number', 'boolean', 'null') then raise exception 'Tipo de valor inválido.'; end if;
    novos_valores := jsonb_set(novos_valores, array[item.key], item.value, false);
  end loop;
  if novos_valores = registro.valores then return registro; end if;
  update public.sr_planilha_registros set valores = novos_valores where id = p_registro_id returning * into registro;
  return registro;
end;
$$;

create or replace function sr_planilha_interno.registrar_versao()
returns trigger language plpgsql security definer set search_path = ''
as $sr_auditoria$
declare
  diferencas jsonb := '[]'::jsonb;
  anterior_em timestamptz;
  i integer;
begin
  if tg_op = 'UPDATE' and (auth.uid() is null or new.atualizado_por is distinct from auth.uid()) then
    raise exception using errcode = '42501', message = 'Autor da alteração inválido.';
  end if;
  if auth.uid() is not null and not exists(select 1 from public.perfis_usuarios p where p.id = auth.uid() and p.ativo is true) then
    raise exception using errcode = '42501', message = 'Perfil ativo não encontrado.';
  end if;
  if tg_op = 'UPDATE' then
    for i in 0..24 loop
      if new.valores -> i is distinct from old.valores -> i then
        select v.alterado_em into anterior_em from public.sr_planilha_versoes v
        where v.registro_id = new.id and (v.versao = 1 or v.alteracoes @> jsonb_build_array(jsonb_build_object('coluna', i)))
        order by v.versao desc limit 1;
        diferencas := diferencas || jsonb_build_array(jsonb_build_object(
          'coluna', i, 'anterior', old.valores -> i, 'novo', new.valores -> i,
          'anterior_em', anterior_em, 'novo_em', new.atualizado_em,
          'usuario_nome', new.atualizado_nome, 'usuario_email', new.atualizado_email));
      end if;
    end loop;
  end if;
  insert into public.sr_planilha_versoes(registro_id, versao, valores, alteracoes, acao, usuario_id, usuario_nome, usuario_email, alterado_em)
  values(new.id, new.versao, new.valores, diferencas,
    case when tg_op = 'INSERT' then 'carga_inicial' else 'edicao' end,
    auth.uid(), new.atualizado_nome, new.atualizado_email, new.atualizado_em);
  return new;
end;
$sr_auditoria$;

-- Complementa somente metadados conhecidos das versões antigas.
-- A data de Antes é a última versão que gravou aquele campo, não a última edição de outro campo.
update public.sr_planilha_versoes v
set alteracoes = (
  select jsonb_agg(e.valor || jsonb_build_object(
    'anterior_em', (select h.alterado_em from public.sr_planilha_versoes h
      where h.registro_id = v.registro_id and h.versao < v.versao
        and (h.versao = 1 or h.alteracoes @> jsonb_build_array(jsonb_build_object('coluna', (e.valor ->> 'coluna')::int)))
      order by h.versao desc limit 1),
    'novo_em', v.alterado_em, 'usuario_nome', v.usuario_nome, 'usuario_email', v.usuario_email) order by e.ordem)
  from jsonb_array_elements(v.alteracoes) with ordinality e(valor, ordem)
)
where jsonb_array_length(v.alteracoes) > 0
  and exists(select 1 from jsonb_array_elements(v.alteracoes) e where not e ? 'novo_em');

-- Recupera a autoria já registrada na versão atual, sem gerar uma edição de dados.
-- A suspensão destes dois gatilhos próprios é protegida pela transação da atualização.
alter table public.sr_planilha_registros disable trigger sr_planilha_validar;
alter table public.sr_planilha_registros disable trigger sr_planilha_versionar;
update public.sr_planilha_registros c
set atualizado_nome = coalesce(c.atualizado_nome, v.usuario_nome),
    atualizado_email = coalesce(c.atualizado_email, v.usuario_email)
from public.sr_planilha_versoes v
where v.registro_id = c.id and v.versao = c.versao
  and ((c.atualizado_nome is null and v.usuario_nome is not null) or (c.atualizado_email is null and v.usuario_email is not null));
alter table public.sr_planilha_registros enable trigger sr_planilha_validar;
alter table public.sr_planilha_registros enable trigger sr_planilha_versionar;

-- Nome histórico não é inventado para versões antigas: o e-mail já registrado é preservado.
revoke all on public.sr_planilha_registros, public.sr_planilha_versoes from public, anon, authenticated;
grant select on public.sr_planilha_registros, public.sr_planilha_versoes to authenticated;
grant update(valores) on public.sr_planilha_registros to authenticated;
drop policy if exists sr_planilha_edicao_restrita on public.sr_planilha_registros;
create policy sr_planilha_edicao_restrita on public.sr_planilha_registros as restrictive for update to authenticated
using ((select sr_planilha_interno.pode_editar())) with check ((select sr_planilha_interno.pode_editar()));

-- Auditoria da aba Planilha (lista compartilhada de chamados).
alter table public.chamados_oracle add column if not exists portal_versao integer not null default 1;
alter table public.chamados_oracle add column if not exists portal_atualizado_em timestamptz not null default now();
alter table public.chamados_oracle add column if not exists portal_atualizado_por uuid;
alter table public.chamados_oracle add column if not exists portal_atualizado_nome text;
alter table public.chamados_oracle add column if not exists portal_atualizado_email text;

create table if not exists public.chamados_oracle_versoes (
  id uuid primary key default gen_random_uuid(),
  ano integer not null,
  numero_sr text not null,
  versao integer not null check(versao > 0),
  depois jsonb not null check(jsonb_typeof(depois) = 'object'),
  alteracoes jsonb not null default '[]'::jsonb check(jsonb_typeof(alteracoes) = 'array'),
  acao text not null check(acao in ('carga_inicial','edicao')),
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_nome text,
  usuario_email text,
  alterado_em timestamptz not null,
  unique(ano, numero_sr, versao)
);
create index if not exists chamados_oracle_versoes_usuario_idx on public.chamados_oracle_versoes(usuario_id);
alter table public.chamados_oracle_versoes enable row level security;
alter table public.chamados_oracle enable row level security;

create or replace function sr_planilha_interno.pode_consultar_chamado(p_ano integer)
returns boolean language sql stable security invoker set search_path = '' as $ch_consulta$
  select exists(select 1 from public.perfis_usuarios p where p.id = (select auth.uid()) and p.ativo is true
    and (p.perfil = 'administrador' or p.permissoes ->> ('chamados_' || p_ano::text) = 'true' or p.permissoes ->> 'inicio' = 'true')
    and (coalesce(p.mfa_obrigatorio, false) is false or (select auth.jwt() ->> 'aal') = 'aal2'));
$ch_consulta$;

create or replace function sr_planilha_interno.pode_editar_chamado(p_ano integer)
returns boolean language sql stable security invoker set search_path = '' as $ch_edicao$
  select exists(select 1 from public.perfis_usuarios p where p.id = (select auth.uid()) and p.ativo is true
    and (p.perfil = 'administrador' or (p.perfil = 'gestor' and p.permissoes ->> ('chamados_' || p_ano::text) = 'true'))
    and (coalesce(p.mfa_obrigatorio, false) is false or (select auth.jwt() ->> 'aal') = 'aal2'));
$ch_edicao$;

drop policy if exists chamados_portal_editores on public.chamados_oracle;
create policy chamados_portal_editores on public.chamados_oracle for update to authenticated
using (sr_planilha_interno.pode_editar_chamado(ano)) with check (sr_planilha_interno.pode_editar_chamado(ano));
drop policy if exists chamados_portal_edicao_restrita on public.chamados_oracle;
create policy chamados_portal_edicao_restrita on public.chamados_oracle as restrictive for update to authenticated
using (sr_planilha_interno.pode_editar_chamado(ano)) with check (sr_planilha_interno.pode_editar_chamado(ano));
drop policy if exists chamados_portal_insercao_restrita on public.chamados_oracle;
create policy chamados_portal_insercao_restrita on public.chamados_oracle as restrictive for insert to authenticated
with check (sr_planilha_interno.pode_editar_chamado(ano));
drop policy if exists chamados_portal_exclusao_restrita on public.chamados_oracle;
create policy chamados_portal_exclusao_restrita on public.chamados_oracle as restrictive for delete to authenticated
using (sr_planilha_interno.pode_editar_chamado(ano));
drop policy if exists chamados_historico_consulta on public.chamados_oracle_versoes;
create policy chamados_historico_consulta on public.chamados_oracle_versoes for select to authenticated
using (sr_planilha_interno.pode_consultar_chamado(ano));

-- Permissões de consulta existentes na lista continuam válidas. Apenas a escrita é limitada.
revoke update on public.chamados_oracle from public, anon, authenticated;
do $ch_privilegios$
declare col record;
begin
  for col in select a.attname from pg_catalog.pg_attribute a where a.attrelid = 'public.chamados_oracle'::regclass and a.attnum > 0 and not a.attisdropped loop
    execute format('revoke update(%I) on public.chamados_oracle from public, anon, authenticated', col.attname);
  end loop;
end;
$ch_privilegios$;
grant update(resumo,issue_type,servico,status,severidade,criado_texto,atualizado_texto,fechado_texto,
  contato_primario,grupo_usuario,tenancy,impacto_negocio,conta,referencia_cliente,url_recurso) on public.chamados_oracle to authenticated;
revoke all on public.chamados_oracle_versoes from public, anon, authenticated;
grant select on public.chamados_oracle_versoes to authenticated;

create or replace function sr_planilha_interno.validar_chamado()
returns trigger language plpgsql security invoker set search_path = '' as $ch_validar$
begin
  if current_user not in ('postgres','service_role','supabase_admin') and not sr_planilha_interno.pode_editar_chamado(new.ano) then
    raise exception using errcode = '42501', message = 'Somente Administrador e Gestor ativos podem editar e salvar a planilha.';
  end if;
  if tg_op = 'UPDATE' and (new.ano is distinct from old.ano or new.numero_sr is distinct from old.numero_sr) then
    raise exception 'A identificação do chamado permanece fixa.';
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - array['portal_versao','portal_atualizado_em','portal_atualizado_por','portal_atualizado_nome','portal_atualizado_email']) =
     (to_jsonb(old) - array['portal_versao','portal_atualizado_em','portal_atualizado_por','portal_atualizado_nome','portal_atualizado_email']) then return null; end if;
  new.portal_versao := case when tg_op = 'UPDATE' then old.portal_versao + 1 else 1 end;
  new.portal_atualizado_em := clock_timestamp();
  new.portal_atualizado_por := auth.uid();
  if auth.uid() is not null then
    select p.nome, p.email into new.portal_atualizado_nome, new.portal_atualizado_email
    from public.perfis_usuarios p where p.id = auth.uid() and p.ativo is true;
  else
    new.portal_atualizado_nome := 'Importação / manutenção do banco'; new.portal_atualizado_email := null;
  end if;
  return new;
end;
$ch_validar$;

create or replace function sr_planilha_interno.registrar_chamado_versao()
returns trigger language plpgsql security definer set search_path = '' as $ch_auditar$
declare diffs jsonb := '[]'::jsonb; campo record; anterior_em timestamptz;
begin
  if tg_op = 'UPDATE' then
    for campo in select * from jsonb_each(to_jsonb(new) - array['portal_versao','portal_atualizado_em','portal_atualizado_por','portal_atualizado_nome','portal_atualizado_email']) loop
      if campo.value is distinct from to_jsonb(old) -> campo.key then
        select v.alterado_em into anterior_em from public.chamados_oracle_versoes v
        where v.ano = new.ano and v.numero_sr = new.numero_sr
          and (v.versao = 1 or v.alteracoes @> jsonb_build_array(jsonb_build_object('campo', campo.key)))
        order by v.versao desc limit 1;
        diffs := diffs || jsonb_build_array(jsonb_build_object('campo', campo.key,
          'anterior', to_jsonb(old) -> campo.key, 'novo', campo.value,
          'anterior_em', anterior_em, 'novo_em', new.portal_atualizado_em,
          'usuario_nome', new.portal_atualizado_nome, 'usuario_email', new.portal_atualizado_email));
      end if;
    end loop;
  end if;
  insert into public.chamados_oracle_versoes(ano,numero_sr,versao,depois,alteracoes,acao,usuario_id,usuario_nome,usuario_email,alterado_em)
  values(new.ano,new.numero_sr,new.portal_versao,to_jsonb(new),diffs,
    case when tg_op = 'INSERT' then 'carga_inicial' else 'edicao' end,
    new.portal_atualizado_por,new.portal_atualizado_nome,new.portal_atualizado_email,new.portal_atualizado_em);
  return new;
end;
$ch_auditar$;

insert into public.chamados_oracle_versoes(ano,numero_sr,versao,depois,acao,usuario_id,usuario_nome,usuario_email,alterado_em)
select ano,numero_sr,portal_versao,to_jsonb(c),'carga_inicial',portal_atualizado_por,portal_atualizado_nome,portal_atualizado_email,portal_atualizado_em
from public.chamados_oracle c on conflict(ano,numero_sr,versao) do nothing;

drop trigger if exists chamados_portal_validar on public.chamados_oracle;
create trigger chamados_portal_validar before insert or update on public.chamados_oracle for each row execute function sr_planilha_interno.validar_chamado();
drop trigger if exists chamados_portal_versionar on public.chamados_oracle;
create trigger chamados_portal_versionar after insert or update on public.chamados_oracle for each row execute function sr_planilha_interno.registrar_chamado_versao();

revoke execute on function sr_planilha_interno.pode_consultar_chamado(integer), sr_planilha_interno.pode_editar_chamado(integer),
 sr_planilha_interno.validar_chamado(), sr_planilha_interno.registrar_chamado_versao(), sr_planilha_interno.validar_registro(), sr_planilha_interno.registrar_versao()
from public, anon, authenticated;
grant usage on schema sr_planilha_interno to authenticated;
grant execute on function sr_planilha_interno.pode_consultar_chamado(integer), sr_planilha_interno.pode_editar_chamado(integer) to authenticated;
notify pgrst, 'reload schema';

select 'v9 instalada: Administrador/Gestor, autoria e auditoria da SR e da Planilha.' as resultado;

-- V10: visualização independente de Planilha, SR e Consolidado e logs do Analítico.

create table if not exists sr_planilha_interno.atualizacoes_portal (
  chave text primary key, aplicado_em timestamptz not null default clock_timestamp()
);
alter table sr_planilha_interno.atualizacoes_portal enable row level security;
revoke all on sr_planilha_interno.atualizacoes_portal from public, anon, authenticated;

-- Uma única migração mantém a visualização anterior. Novos usuários precisam de liberação.
do $abas_migracao$
begin
  if not exists(select 1 from sr_planilha_interno.atualizacoes_portal where chave='abas_v10') then
    update public.perfis_usuarios set permissoes = coalesce(permissoes,'{}'::jsonb)
      || case when coalesce(permissoes,'{}'::jsonb) ? 'aba_planilha' then '{}'::jsonb else '{"aba_planilha":true}'::jsonb end
      || case when coalesce(permissoes,'{}'::jsonb) ? 'aba_sr' then '{}'::jsonb else '{"aba_sr":true}'::jsonb end
      || case when coalesce(permissoes,'{}'::jsonb) ? 'aba_consolidado' then '{}'::jsonb else '{"aba_consolidado":true}'::jsonb end;
    insert into sr_planilha_interno.atualizacoes_portal(chave) values('abas_v10');
  end if;
end;
$abas_migracao$;

create or replace function sr_planilha_interno.administrador_abas()
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.perfis_usuarios p where p.id=(select auth.uid())
    and p.ativo is true and p.perfil='administrador'
    and (coalesce(p.mfa_obrigatorio,false) is false or (select auth.jwt()->>'aal')='aal2'));
$$;
create or replace function sr_planilha_interno.pode_visualizar_aba(p_aba text)
returns boolean language sql stable security invoker set search_path='' as $$
  select p_aba in ('planilha','sr','consolidado') and exists(
    select 1 from public.perfis_usuarios p where p.id=(select auth.uid()) and p.ativo is true
      and (coalesce(p.mfa_obrigatorio,false) is false or (select auth.jwt()->>'aal')='aal2')
      and (p.perfil='administrador' or p.permissoes->('aba_'||p_aba)='true'::jsonb)
      and (p.perfil='administrador' or p.permissoes->'inicio'='true'::jsonb
        or p.permissoes->'chamados_2025'='true'::jsonb or p.permissoes->'chamados_2026'='true'::jsonb));
$$;
create or replace function sr_planilha_interno.pode_consultar()
returns boolean language sql stable security invoker set search_path='' as $$
  select sr_planilha_interno.pode_visualizar_aba('sr') or sr_planilha_interno.pode_visualizar_aba('consolidado');
$$;
create or replace function sr_planilha_interno.pode_editar_chamado(p_ano integer)
returns boolean language sql stable security invoker set search_path='' as $$
  select sr_planilha_interno.pode_visualizar_aba('planilha') and exists(
    select 1 from public.perfis_usuarios p where p.id=(select auth.uid()) and p.ativo is true
    and (p.perfil='administrador' or (p.perfil='gestor' and p.permissoes->('chamados_'||p_ano)='true'::jsonb))
    and (coalesce(p.mfa_obrigatorio,false) is false or (select auth.jwt()->>'aal')='aal2'));
$$;
create or replace function sr_planilha_interno.pode_consultar_chamado(p_ano integer)
returns boolean language sql stable security invoker set search_path='' as $$
  select (sr_planilha_interno.pode_visualizar_aba('planilha') or sr_planilha_interno.pode_visualizar_aba('consolidado'))
    and exists(select 1 from public.perfis_usuarios p where p.id=(select auth.uid()) and p.ativo is true
      and (p.perfil='administrador' or p.permissoes->('chamados_'||p_ano)='true'::jsonb)
      and (coalesce(p.mfa_obrigatorio,false) is false or (select auth.jwt()->>'aal')='aal2'));
$$;

-- As restrições continuam válidas mesmo que exista uma política permissiva legada.
drop policy if exists sr_abas_consulta_restrita on public.sr_planilha_registros;
create policy sr_abas_consulta_restrita on public.sr_planilha_registros as restrictive for select to authenticated
using((select sr_planilha_interno.pode_consultar()));
drop policy if exists sr_abas_historico_restrito on public.sr_planilha_versoes;
create policy sr_abas_historico_restrito on public.sr_planilha_versoes as restrictive for select to authenticated
using((select sr_planilha_interno.pode_consultar()));
drop policy if exists chamados_abas_historico_restrito on public.chamados_oracle_versoes;
create policy chamados_abas_historico_restrito on public.chamados_oracle_versoes as restrictive for select to authenticated
using(sr_planilha_interno.pode_consultar_chamado(ano));

create table if not exists public.logs_abas_portal (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null, usuario_nome text, usuario_email text, perfil text,
  aba text not null check(aba in ('planilha','sr','consolidado')),
  acao text not null check(acao in ('acesso','exportacao','exportacao_original','historico','recarregamento','salvamento','permissao','erro','acesso_bloqueado')),
  origem text not null check(origem in ('navegador','banco')),
  ano integer, referencia text, quantidade integer,
  detalhes jsonb not null default '{}'::jsonb,
  registrado_em timestamptz not null default clock_timestamp()
);
create index if not exists logs_abas_data_idx on public.logs_abas_portal(registrado_em desc,id desc);
create index if not exists logs_abas_aba_data_idx on public.logs_abas_portal(aba,registrado_em desc);
create index if not exists logs_abas_usuario_data_idx on public.logs_abas_portal(usuario_id,registrado_em desc);
alter table public.logs_abas_portal enable row level security;
revoke all on public.logs_abas_portal from public,anon,authenticated;
grant select on public.logs_abas_portal to authenticated;
drop policy if exists logs_abas_apenas_administrador on public.logs_abas_portal;
create policy logs_abas_apenas_administrador on public.logs_abas_portal for select to authenticated
using((select sr_planilha_interno.administrador_abas()));
drop policy if exists logs_abas_administrador_restrito on public.logs_abas_portal;
create policy logs_abas_administrador_restrito on public.logs_abas_portal as restrictive for select to authenticated
using((select sr_planilha_interno.administrador_abas()));

-- A API registra apenas eventos de uso. Salvamentos e permissões vêm de gatilhos.
create or replace function sr_planilha_interno.registrar_evento_aba(
  p_aba text,p_acao text,p_ano integer,p_quantidade integer,p_referencia text,p_detalhes jsonb
) returns uuid language plpgsql security definer set search_path='' as $evento$
declare ator public.perfis_usuarios; resultado uuid; permitido boolean;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Autenticação necessária.'; end if;
  select * into ator from public.perfis_usuarios where id=auth.uid();
  if not found or ator.ativo is not true or (coalesce(ator.mfa_obrigatorio,false) and coalesce(auth.jwt()->>'aal','')<>'aal2') then
    raise exception using errcode='42501',message='Perfil ativo e autenticação validada são necessários.';
  end if;
  if p_aba is null or p_aba not in ('planilha','sr','consolidado') or p_acao is null
    or p_acao not in ('acesso','exportacao','exportacao_original','historico','recarregamento','erro','acesso_bloqueado') then
    raise exception 'Evento de uso inválido.';
  end if;
  if p_ano is not null and p_ano not in (2025,2026) then raise exception 'Ano inválido.'; end if;
  permitido := sr_planilha_interno.pode_visualizar_aba(p_aba)
    and (p_ano is null or ator.perfil='administrador' or ator.permissoes->('chamados_'||p_ano)='true'::jsonb);
  if not permitido and p_acao<>'acesso_bloqueado' then
    raise exception using errcode='42501',message='Visualização da aba não autorizada.';
  end if;
  if p_quantidade is not null and (p_quantidade<0 or p_quantidade>10000000) then raise exception 'Quantidade inválida.'; end if;
  if p_referencia is not null and length(p_referencia)>120 then raise exception 'Referência inválida.'; end if;
  if p_detalhes is null then p_detalhes := '{}'::jsonb; end if;
  if jsonb_typeof(p_detalhes)<>'object' or length(p_detalhes::text)>2000
    or exists(select 1 from jsonb_object_keys(p_detalhes) k where k not in ('pendentes','tipo','motivo','pagina')) then
    raise exception 'Detalhes do evento inválidos.';
  end if;
  insert into public.logs_abas_portal(usuario_id,usuario_nome,usuario_email,perfil,aba,acao,origem,ano,referencia,quantidade,detalhes)
  values(ator.id,ator.nome,ator.email,ator.perfil,p_aba,p_acao,'navegador',p_ano,p_referencia,p_quantidade,p_detalhes)
  returning id into resultado;
  return resultado;
end;
$evento$;
create or replace function public.registrar_evento_aba_portal(
  p_aba text,p_acao text,p_ano integer default null,p_quantidade integer default null,
  p_referencia text default null,p_detalhes jsonb default '{}'::jsonb
) returns uuid language sql security invoker set search_path='' as $$
  select sr_planilha_interno.registrar_evento_aba(p_aba,p_acao,p_ano,p_quantidade,p_referencia,p_detalhes);
$$;

create or replace function sr_planilha_interno.configurar_permissoes_abas(
  p_usuario_id uuid,p_permissoes jsonb,p_permissoes_esperadas jsonb
) returns jsonb language plpgsql security definer set search_path='' as $configurar$
declare atual jsonb; chave text;
begin
  if auth.uid() is null or not sr_planilha_interno.administrador_abas() then
    raise exception using errcode='42501',message='Somente Administrador ativo pode configurar as permissões.';
  end if;
  if p_permissoes is null or jsonb_typeof(p_permissoes)<>'object' then raise exception 'Permissões inválidas.'; end if;
  foreach chave in array array['aba_planilha','aba_sr','aba_consolidado'] loop
    if not (p_permissoes ? chave) or jsonb_typeof(p_permissoes->chave)<>'boolean' then raise exception 'Escolha a visualização das três abas.'; end if;
  end loop;
  select coalesce(permissoes,'{}'::jsonb) into atual from public.perfis_usuarios where id=p_usuario_id for update;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  if atual is distinct from coalesce(p_permissoes_esperadas,'{}'::jsonb) then
    raise exception using errcode='40001',message='As permissões mudaram em outra sessão. Reabra Configurar antes de salvar.';
  end if;
  update public.perfis_usuarios set permissoes=p_permissoes where id=p_usuario_id;
  return p_permissoes;
end;
$configurar$;
create or replace function public.configurar_permissoes_abas_portal(
  p_usuario_id uuid,p_permissoes jsonb,p_permissoes_esperadas jsonb
) returns jsonb language sql security invoker set search_path='' as $$
  select sr_planilha_interno.configurar_permissoes_abas(p_usuario_id,p_permissoes,p_permissoes_esperadas);
$$;

create or replace function sr_planilha_interno.auditar_permissoes_abas()
returns trigger language plpgsql security definer set search_path='' as $permissoes$
declare ator public.perfis_usuarios; aba_nome text; anterior boolean; novo boolean;
begin
  if auth.uid() is null then return new; end if;
  select * into ator from public.perfis_usuarios where id=auth.uid();
  foreach aba_nome in array array['planilha','sr','consolidado'] loop
    anterior := case when tg_op='UPDATE' then coalesce(old.permissoes->('aba_'||aba_nome)='true'::jsonb,false) else false end;
    novo := coalesce(new.permissoes->('aba_'||aba_nome)='true'::jsonb,false);
    if anterior is distinct from novo then
      if not sr_planilha_interno.administrador_abas() then
        raise exception using errcode='42501',message='Somente Administrador pode alterar a visualização das abas.';
      end if;
      insert into public.logs_abas_portal(usuario_id,usuario_nome,usuario_email,perfil,aba,acao,origem,referencia,detalhes)
      values(ator.id,ator.nome,ator.email,ator.perfil,aba_nome,'permissao','banco',new.id::text,
        jsonb_build_object('usuario_alvo',new.id,'nome_alvo',new.nome,'email_alvo',new.email,'antes',anterior,'depois',novo));
    end if;
  end loop;
  return new;
end;
$permissoes$;
drop trigger if exists portal_auditar_permissoes_abas on public.perfis_usuarios;
create trigger portal_auditar_permissoes_abas after insert or update of permissoes on public.perfis_usuarios
for each row execute function sr_planilha_interno.auditar_permissoes_abas();

create or replace function public.salvar_sr_planilha_com_log(
  p_registro_id uuid,p_versao_atual integer,p_alteracoes jsonb,p_aba text
) returns public.sr_planilha_registros language plpgsql security invoker set search_path='' as $salvar$
declare resultado public.sr_planilha_registros;
begin
  if p_aba is null or p_aba not in ('sr','consolidado') or not sr_planilha_interno.pode_visualizar_aba(p_aba) then
    raise exception using errcode='42501',message='Aba não autorizada para este salvamento.';
  end if;
  perform set_config('pluma.aba_salvamento',p_aba,true);
  select * into resultado from public.salvar_sr_planilha(p_registro_id,p_versao_atual,p_alteracoes);
  return resultado;
end;
$salvar$;
create or replace function sr_planilha_interno.auditar_salvamento_aba()
returns trigger language plpgsql security definer set search_path='' as $salvo$
declare ator public.perfis_usuarios; aba_nome text; campos jsonb; ref text; v integer; ano_ref integer;
begin
  if auth.uid() is null then return new; end if;
  select * into ator from public.perfis_usuarios where id=auth.uid();
  if not found or ator.ativo is not true then raise exception using errcode='42501',message='Autor do salvamento inválido.'; end if;
  if tg_table_name='sr_planilha_registros' then
    aba_nome := nullif(current_setting('pluma.aba_salvamento',true),'');
    if aba_nome is null or aba_nome not in ('sr','consolidado') then
      aba_nome := case when sr_planilha_interno.pode_visualizar_aba('sr') then 'sr' else 'consolidado' end;
    end if;
    select coalesce(jsonb_agg(i),'[]'::jsonb) into campos from generate_series(0,24) i where new.valores->i is distinct from old.valores->i;
    ref:=new.numero_sr; v:=new.versao; ano_ref:=null;
  else
    aba_nome:='planilha'; ref:=new.numero_sr; v:=new.portal_versao; ano_ref:=new.ano;
    select coalesce(jsonb_agg(k),'[]'::jsonb) into campos
    from jsonb_object_keys(to_jsonb(new)-array['portal_versao','portal_atualizado_em','portal_atualizado_por','portal_atualizado_nome','portal_atualizado_email']) k
    where to_jsonb(new)->k is distinct from to_jsonb(old)->k;
  end if;
  insert into public.logs_abas_portal(usuario_id,usuario_nome,usuario_email,perfil,aba,acao,origem,ano,referencia,quantidade,detalhes)
  values(ator.id,ator.nome,ator.email,ator.perfil,aba_nome,'salvamento','banco',ano_ref,ref,jsonb_array_length(campos),
    jsonb_build_object('versao',v,'campos',campos,'registro_id',new.id));
  return new;
end;
$salvo$;
drop trigger if exists zz_portal_log_sr on public.sr_planilha_registros;
create trigger zz_portal_log_sr after update on public.sr_planilha_registros for each row execute function sr_planilha_interno.auditar_salvamento_aba();
drop trigger if exists zz_portal_log_planilha on public.chamados_oracle;
create trigger zz_portal_log_planilha after update on public.chamados_oracle for each row execute function sr_planilha_interno.auditar_salvamento_aba();

revoke execute on function sr_planilha_interno.administrador_abas(),sr_planilha_interno.pode_visualizar_aba(text),
 sr_planilha_interno.registrar_evento_aba(text,text,integer,integer,text,jsonb),sr_planilha_interno.configurar_permissoes_abas(uuid,jsonb,jsonb),
 sr_planilha_interno.auditar_permissoes_abas(),sr_planilha_interno.auditar_salvamento_aba(),
 public.registrar_evento_aba_portal(text,text,integer,integer,text,jsonb),public.configurar_permissoes_abas_portal(uuid,jsonb,jsonb),
 public.salvar_sr_planilha_com_log(uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function sr_planilha_interno.administrador_abas(),sr_planilha_interno.pode_visualizar_aba(text),
 sr_planilha_interno.registrar_evento_aba(text,text,integer,integer,text,jsonb),sr_planilha_interno.configurar_permissoes_abas(uuid,jsonb,jsonb),
 public.registrar_evento_aba_portal(text,text,integer,integer,text,jsonb),public.configurar_permissoes_abas_portal(uuid,jsonb,jsonb),
 public.salvar_sr_planilha_com_log(uuid,integer,jsonb,text) to authenticated;
notify pgrst,'reload schema';

commit;
select 'V10 instalada: visualização por usuário e logs das três abas.' as resultado;
