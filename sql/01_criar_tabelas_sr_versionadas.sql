-- Execute no projeto Supabase usado pelo portal SUPORTE ORACLE.
-- Pré-requisito: public.perfis_usuarios já utilizado pelo login do site.
-- Este script não altera tabelas, perfis nem permissões existentes do portal.
begin;

do $$
begin
  if to_regclass('public.perfis_usuarios') is null then
    raise exception 'Projeto incorreto: public.perfis_usuarios não foi encontrada.';
  end if;
end;
$$;

create schema if not exists sr_planilha_interno;

create table if not exists public.sr_planilha_registros (
  id uuid primary key default gen_random_uuid(),
  origem_revisao text not null,
  linha_origem text not null,
  numero_sr text not null check (length(btrim(numero_sr)) > 0),
  valores jsonb not null check (jsonb_typeof(valores) = 'array' and jsonb_array_length(valores) = 25),
  aging_calculado boolean not null default false,
  versao integer not null default 1 check (versao > 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (origem_revisao, linha_origem)
);

create table if not exists public.sr_planilha_versoes (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null references public.sr_planilha_registros(id) on delete restrict,
  versao integer not null check (versao > 0),
  valores jsonb not null check (jsonb_typeof(valores) = 'array' and jsonb_array_length(valores) = 25),
  alteracoes jsonb not null default '[]'::jsonb check (jsonb_typeof(alteracoes) = 'array'),
  acao text not null check (acao in ('carga_inicial', 'edicao')),
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_email text,
  alterado_em timestamptz not null default now(),
  unique (registro_id, versao)
);

create index if not exists sr_planilha_numero_idx on public.sr_planilha_registros(numero_sr);
create index if not exists sr_planilha_atualizado_por_idx on public.sr_planilha_registros(atualizado_por);
create index if not exists sr_planilha_versoes_usuario_idx on public.sr_planilha_versoes(usuario_id);

-- Consulta apenas do próprio perfil. Nunca usa user_metadata para autorizar.
create or replace function sr_planilha_interno.pode_consultar()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.perfis_usuarios p
    where p.id = (select auth.uid()) and p.ativo is true
      and (p.perfil = 'administrador'
        or p.permissoes ->> 'inicio' = 'true'
        or p.permissoes ->> 'chamados_2025' = 'true'
        or p.permissoes ->> 'chamados_2026' = 'true')
      and (coalesce(p.mfa_obrigatorio, false) is false or (select auth.jwt() ->> 'aal') = 'aal2')
  );
$$;

create or replace function sr_planilha_interno.pode_editar()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.perfis_usuarios p
    where p.id = (select auth.uid()) and p.ativo is true and p.perfil = 'administrador'
      and (coalesce(p.mfa_obrigatorio, false) is false or (select auth.jwt() ->> 'aal') = 'aal2')
  );
$$;

alter table public.sr_planilha_registros enable row level security;
alter table public.sr_planilha_versoes enable row level security;

drop policy if exists sr_planilha_consulta on public.sr_planilha_registros;
create policy sr_planilha_consulta on public.sr_planilha_registros for select to authenticated
using ((select sr_planilha_interno.pode_consultar()));

drop policy if exists sr_planilha_edicao on public.sr_planilha_registros;
create policy sr_planilha_edicao on public.sr_planilha_registros for update to authenticated
using ((select sr_planilha_interno.pode_editar()))
with check ((select sr_planilha_interno.pode_editar()));

drop policy if exists sr_planilha_historico_consulta on public.sr_planilha_versoes;
create policy sr_planilha_historico_consulta on public.sr_planilha_versoes for select to authenticated
using ((select sr_planilha_interno.pode_consultar()));

-- Valores e metadados são validados também em atualizações diretas autorizadas.
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
      raise exception using errcode = '42501', message = 'Somente administradores ativos podem editar a SR.';
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
  return new;
end;
$$;

-- SECURITY DEFINER é usado somente pelo gatilho privado para inserir na trilha
-- imutável. O cliente não recebe INSERT/UPDATE/DELETE na tabela de versões.
-- Sem EXECUTE para clientes, sem SQL dinâmico e com search_path fixo.
create or replace function sr_planilha_interno.registrar_versao()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  diferencas jsonb := '[]'::jsonb;
  email_autor text;
  i integer;
begin
  if tg_op = 'UPDATE' and (auth.uid() is null or new.atualizado_por is distinct from auth.uid()) then
    raise exception using errcode = '42501', message = 'Autor da alteração inválido.';
  end if;
  if auth.uid() is not null then
    select p.email into email_autor from public.perfis_usuarios p where p.id = auth.uid() and p.ativo is true;
    if not found then raise exception using errcode = '42501', message = 'Perfil ativo não encontrado.'; end if;
  end if;
  if tg_op = 'UPDATE' then
    for i in 0..24 loop
      if new.valores -> i is distinct from old.valores -> i then
        diferencas := diferencas || jsonb_build_array(jsonb_build_object(
          'coluna', i, 'anterior', old.valores -> i, 'novo', new.valores -> i));
      end if;
    end loop;
  end if;
  insert into public.sr_planilha_versoes(registro_id, versao, valores, alteracoes, acao, usuario_id, usuario_email, alterado_em)
  values(new.id, new.versao, new.valores, diferencas,
    case when tg_op = 'INSERT' then 'carga_inicial' else 'edicao' end,
    auth.uid(), email_autor, new.atualizado_em);
  return new;
end;
$$;

drop trigger if exists sr_planilha_validar on public.sr_planilha_registros;
create trigger sr_planilha_validar before insert or update on public.sr_planilha_registros
for each row execute function sr_planilha_interno.validar_registro();

drop trigger if exists sr_planilha_versionar on public.sr_planilha_registros;
create trigger sr_planilha_versionar after insert or update on public.sr_planilha_registros
for each row execute function sr_planilha_interno.registrar_versao();

-- O bloqueio e a versão esperada impedem que um editor sobrescreva uma versão
-- salva por outro. UPDATE + histórico são confirmados na mesma transação.
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
    raise exception using errcode = '42501', message = 'Somente administradores ativos podem editar a SR.';
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

revoke all on public.sr_planilha_registros, public.sr_planilha_versoes from public, anon, authenticated;
grant select on public.sr_planilha_registros, public.sr_planilha_versoes to authenticated;
grant update(valores) on public.sr_planilha_registros to authenticated;
grant usage on schema sr_planilha_interno to authenticated;
revoke execute on function sr_planilha_interno.pode_consultar(), sr_planilha_interno.pode_editar(),
  sr_planilha_interno.validar_registro(), sr_planilha_interno.registrar_versao() from public, anon, authenticated;
grant execute on function sr_planilha_interno.pode_consultar(), sr_planilha_interno.pode_editar() to authenticated;
revoke execute on function public.salvar_sr_planilha(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_sr_planilha(uuid, integer, jsonb) to authenticated;

comment on table public.sr_planilha_registros is 'Estado atual das linhas da planilha SR; repetições de número SR preservadas pela linha de origem.';
comment on table public.sr_planilha_versoes is 'Histórico de versões da SR. Somente gatilhos do banco gravam a trilha de alterações.';

notify pgrst, 'reload schema';
commit;
