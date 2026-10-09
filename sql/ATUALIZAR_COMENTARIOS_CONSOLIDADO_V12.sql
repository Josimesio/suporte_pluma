-- V12: complementos exclusivos do Consolidado. Projeto: vsnvhaojeiegzfrfvmps.
-- Execute TODO este arquivo no SQL Editor. Requer a instalação V10/V11.
-- Pode ser reexecutado: preserva comentários, planilhas, permissões e histórico.
begin;
do $requisitos$
begin
  if to_regclass('public.chamados_oracle') is null or to_regclass('public.logs_abas_portal') is null
    or to_regprocedure('sr_planilha_interno.pode_visualizar_aba(text)') is null then
    raise exception 'Instale primeiro a V10/V11 do portal SUPORTE ORACLE.';
  end if;
end;
$requisitos$;

create table if not exists public.sr_consolidado_comentarios (
  ano integer not null check (ano in (2025, 2026)),
  numero_sr text not null check (length(numero_sr) between 1 and 120
    and numero_sr = regexp_replace(upper(btrim(numero_sr)), '\s+', '', 'g')),
  comentarios_pmo text not null default '' check (length(comentarios_pmo) <= 20000),
  comentarios_pluma text not null default '' check (length(comentarios_pluma) <= 20000),
  versao integer not null default 1 check (versao > 0),
  atualizado_em timestamptz not null default clock_timestamp(),
  atualizado_por uuid not null references auth.users(id),
  atualizado_nome text, atualizado_email text,
  primary key (ano, numero_sr)
);
create table if not exists public.sr_consolidado_comentarios_versoes (
  ano integer not null, numero_sr text not null, versao integer not null check (versao > 0),
  depois jsonb not null check (jsonb_typeof(depois) = 'object'),
  alteracoes jsonb not null check (jsonb_typeof(alteracoes) = 'array'),
  usuario_id uuid not null, usuario_nome text, usuario_email text,
  alterado_em timestamptz not null,
  primary key (ano, numero_sr, versao),
  foreign key (ano, numero_sr) references public.sr_consolidado_comentarios(ano, numero_sr) on delete restrict
);
alter table public.sr_consolidado_comentarios enable row level security;
alter table public.sr_consolidado_comentarios_versoes enable row level security;

create or replace function sr_planilha_interno.pode_consultar_comentarios(p_ano integer)
returns boolean language sql stable security invoker set search_path = '' as $consulta$
  select p_ano in (2025, 2026) and sr_planilha_interno.pode_visualizar_aba('consolidado')
    and exists(select 1 from public.perfis_usuarios p where p.id = (select auth.uid()) and p.ativo is true
      and (p.perfil = 'administrador' or p.permissoes -> ('chamados_' || p_ano) = 'true'::jsonb));
$consulta$;
create or replace function sr_planilha_interno.pode_editar_comentarios(p_ano integer)
returns boolean language sql stable security invoker set search_path = '' as $edicao$
  select sr_planilha_interno.pode_consultar_comentarios(p_ano)
    and exists(select 1 from public.perfis_usuarios p where p.id = (select auth.uid())
      and p.ativo is true and p.perfil in ('administrador', 'gestor'));
$edicao$;

-- O navegador escreve apenas os textos. Autor, data e versão são definidos pelo banco.
revoke all on public.sr_consolidado_comentarios, public.sr_consolidado_comentarios_versoes from public, anon, authenticated;
grant usage on schema public, sr_planilha_interno to authenticated;
grant select on public.sr_consolidado_comentarios, public.sr_consolidado_comentarios_versoes to authenticated;
grant insert(ano, numero_sr, comentarios_pmo, comentarios_pluma), update(comentarios_pmo, comentarios_pluma)
on public.sr_consolidado_comentarios to authenticated;
drop policy if exists comentarios_consulta on public.sr_consolidado_comentarios;
create policy comentarios_consulta on public.sr_consolidado_comentarios for select to authenticated
using (sr_planilha_interno.pode_consultar_comentarios(ano));
drop policy if exists comentarios_cadastro on public.sr_consolidado_comentarios;
create policy comentarios_cadastro on public.sr_consolidado_comentarios for insert to authenticated
with check (sr_planilha_interno.pode_editar_comentarios(ano));
drop policy if exists comentarios_edicao on public.sr_consolidado_comentarios;
create policy comentarios_edicao on public.sr_consolidado_comentarios for update to authenticated
using (sr_planilha_interno.pode_editar_comentarios(ano)) with check (sr_planilha_interno.pode_editar_comentarios(ano));
drop policy if exists comentarios_historico on public.sr_consolidado_comentarios_versoes;
create policy comentarios_historico on public.sr_consolidado_comentarios_versoes for select to authenticated
using (sr_planilha_interno.pode_consultar_comentarios(ano));

create or replace function sr_planilha_interno.validar_comentarios()
returns trigger language plpgsql security invoker set search_path = '' as $validar$
begin
  if auth.uid() is null or not coalesce(sr_planilha_interno.pode_editar_comentarios(new.ano), false) then
    raise exception using errcode = '42501', message = 'Somente Administrador e Gestor autorizados podem salvar os comentários.';
  end if;
  if not exists(select 1 from public.chamados_oracle c where c.ano = new.ano
    and regexp_replace(upper(btrim(c.numero_sr)), '\s+', '', 'g') = new.numero_sr) then
    raise exception 'O chamado não foi encontrado no ano informado.';
  end if;
  if tg_op = 'UPDATE' then
    if new.ano is distinct from old.ano or new.numero_sr is distinct from old.numero_sr then
      raise exception 'A identificação do comentário permanece fixa.';
    end if;
    if new.comentarios_pmo = old.comentarios_pmo and new.comentarios_pluma = old.comentarios_pluma then return null; end if;
    new.versao := old.versao + 1;
  else new.versao := 1;
  end if;
  new.atualizado_em := clock_timestamp(); new.atualizado_por := auth.uid();
  select p.nome, p.email into new.atualizado_nome, new.atualizado_email
  from public.perfis_usuarios p where p.id = auth.uid() and p.ativo is true;
  return new;
end;
$validar$;
-- Único escritor do histórico e do log. Função de gatilho privada sem EXECUTE público.
create or replace function sr_planilha_interno.versionar_comentarios()
returns trigger language plpgsql security definer set search_path = '' as $versao$
declare diffs jsonb := '[]'::jsonb; campo text; anterior text; novo text; anterior_em timestamptz; ator public.perfis_usuarios;
begin
  if auth.uid() is null or new.atualizado_por is distinct from auth.uid()
    or not coalesce(sr_planilha_interno.pode_editar_comentarios(new.ano), false) then
    raise exception using errcode = '42501', message = 'Autor dos comentários inválido.';
  end if;
  select * into ator from public.perfis_usuarios where id = auth.uid();
  foreach campo in array array['comentarios_pmo', 'comentarios_pluma'] loop
    anterior := ''; anterior_em := null; novo := to_jsonb(new) ->> campo;
    if tg_op = 'UPDATE' then anterior := to_jsonb(old) ->> campo; end if;
    if anterior is not distinct from novo then continue; end if;
    select v.alterado_em into anterior_em from public.sr_consolidado_comentarios_versoes v
    where v.ano = new.ano and v.numero_sr = new.numero_sr
      and v.alteracoes @> jsonb_build_array(jsonb_build_object('campo', campo)) order by v.versao desc limit 1;
    diffs := diffs || jsonb_build_array(jsonb_build_object('campo', campo, 'anterior', anterior, 'novo', novo,
      'anterior_em', anterior_em, 'novo_em', new.atualizado_em, 'usuario_nome', ator.nome, 'usuario_email', ator.email));
  end loop;
  insert into public.sr_consolidado_comentarios_versoes(ano, numero_sr, versao, depois, alteracoes, usuario_id, usuario_nome, usuario_email, alterado_em)
  values(new.ano, new.numero_sr, new.versao,
    jsonb_build_object('comentarios_pmo', new.comentarios_pmo, 'comentarios_pluma', new.comentarios_pluma),
    diffs, ator.id, ator.nome, ator.email, new.atualizado_em);
  insert into public.logs_abas_portal(usuario_id, usuario_nome, usuario_email, perfil, aba, acao, origem, ano, referencia, quantidade, detalhes)
  values(ator.id, ator.nome, ator.email, ator.perfil, 'consolidado', 'salvamento', 'banco', new.ano, new.numero_sr, jsonb_array_length(diffs),
    jsonb_build_object('tipo', 'comentarios_consolidado', 'versao', new.versao, 'campos',
      (select coalesce(jsonb_agg(d ->> 'campo'), '[]'::jsonb) from jsonb_array_elements(diffs) d)));
  return new;
end;
$versao$;
drop trigger if exists comentarios_validacao on public.sr_consolidado_comentarios;
create trigger comentarios_validacao before insert or update on public.sr_consolidado_comentarios
for each row execute function sr_planilha_interno.validar_comentarios();
drop trigger if exists comentarios_versionamento on public.sr_consolidado_comentarios;
create trigger comentarios_versionamento after insert or update on public.sr_consolidado_comentarios
for each row execute function sr_planilha_interno.versionar_comentarios();

create or replace function public.salvar_comentarios_consolidado(p_ano integer, p_numero_sr text, p_versao_atual integer, p_alteracoes jsonb)
returns public.sr_consolidado_comentarios language plpgsql security invoker set search_path = '' as $salvar$
declare numero text; registro public.sr_consolidado_comentarios; resultado public.sr_consolidado_comentarios; item record; existente boolean;
begin
  numero := regexp_replace(upper(btrim(p_numero_sr)), '\s+', '', 'g');
  if auth.uid() is null or not coalesce(sr_planilha_interno.pode_editar_comentarios(p_ano), false) then
    raise exception using errcode = '42501', message = 'Edição dos comentários não autorizada.';
  end if;
  if numero is null or numero = '' or p_versao_atual is null or p_versao_atual < 0
    or p_alteracoes is null or jsonb_typeof(p_alteracoes) <> 'object' or p_alteracoes = '{}'::jsonb then
    raise exception 'Informe a SR, a versão e os campos alterados.';
  end if;
  for item in select * from jsonb_each(p_alteracoes) loop
    if item.key not in ('comentarios_pmo', 'comentarios_pluma') or jsonb_typeof(item.value) <> 'string'
      or length(item.value #>> '{}') > 20000 then raise exception 'Comentário ou campo inválido.'; end if;
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('consolidado-comentarios:' || p_ano || ':' || numero, 0));
  select * into registro from public.sr_consolidado_comentarios where ano = p_ano and numero_sr = numero for update;
  existente := found;
  if coalesce(registro.versao, 0) <> p_versao_atual then
    raise exception using errcode = '40001', message = 'Outra pessoa alterou os comentários desta SR. Exporte seu rascunho, descarte-o, recarregue e compare antes de salvar.';
  end if;
  if existente then
    if coalesce(p_alteracoes ->> 'comentarios_pmo', registro.comentarios_pmo) = registro.comentarios_pmo
      and coalesce(p_alteracoes ->> 'comentarios_pluma', registro.comentarios_pluma) = registro.comentarios_pluma then return registro; end if;
    update public.sr_consolidado_comentarios set
      comentarios_pmo = coalesce(p_alteracoes ->> 'comentarios_pmo', registro.comentarios_pmo),
      comentarios_pluma = coalesce(p_alteracoes ->> 'comentarios_pluma', registro.comentarios_pluma)
    where ano = p_ano and numero_sr = numero returning * into resultado;
  else
    insert into public.sr_consolidado_comentarios(ano, numero_sr, comentarios_pmo, comentarios_pluma)
    values(p_ano, numero, coalesce(p_alteracoes ->> 'comentarios_pmo', ''), coalesce(p_alteracoes ->> 'comentarios_pluma', '')) returning * into resultado;
  end if;
  return resultado;
exception when unique_violation then
  raise exception using errcode = '40001', message = 'Outra pessoa cadastrou os comentários desta SR. Recarregue e revise seus rascunhos.';
end;
$salvar$;
revoke execute on function sr_planilha_interno.pode_consultar_comentarios(integer), sr_planilha_interno.pode_editar_comentarios(integer),
  sr_planilha_interno.validar_comentarios(), sr_planilha_interno.versionar_comentarios(),
  public.salvar_comentarios_consolidado(integer,text,integer,jsonb) from public, anon, authenticated;
grant execute on function sr_planilha_interno.pode_consultar_comentarios(integer), sr_planilha_interno.pode_editar_comentarios(integer),
  public.salvar_comentarios_consolidado(integer,text,integer,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
select 'V12 instalada: Comentários PMO e Comentários Pluma disponíveis com autoria, versões e logs.' as resultado;
