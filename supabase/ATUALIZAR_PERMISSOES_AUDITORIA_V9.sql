-- V9: Administrador/Gestor, autoria e datas por campo.
-- Projeto do portal: vsnvhaojeiegzfrfvmps.
-- Abra uma consulta nova, cole TODO o arquivo, Ctrl+A dentro do editor e Run.
-- Requer a instalação da SR feita anteriormente. Não apaga registros nem versões.
begin;
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
commit;

select 'v9 instalada: Administrador/Gestor, autoria e auditoria da SR e da Planilha.' as resultado;
