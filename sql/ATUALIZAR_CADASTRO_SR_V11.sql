-- ATUALIZAÇÃO V11: cadastro das SRs sem correspondência no consolidado.
-- Execute TODO este arquivo no SQL Editor do projeto SUPORTE ORACLE.
-- Pré-requisito: instalação V10. Preserva os registros e o histórico existentes.
begin;

do $requisitos$
begin
  if to_regclass('public.sr_planilha_registros') is null
    or to_regclass('public.sr_planilha_versoes') is null
    or to_regclass('public.logs_abas_portal') is null
    or to_regprocedure('public.salvar_sr_planilha_com_log(uuid,integer,jsonb,text)') is null then
    raise exception 'Instale primeiro a V10 ou execute sql/INSTALAR_SR_VERSIONADA.sql para uma instalação nova.';
  end if;
end;
$requisitos$;

create index if not exists sr_planilha_revisao_numero_normalizado_idx
on public.sr_planilha_registros(origem_revisao, regexp_replace(upper(btrim(numero_sr)), '\s+', '', 'g'));

-- A regra privada é usada pela API, pela política RLS e pelo gatilho.
-- SECURITY INVOKER preserva as permissões do usuário em cada consulta.
create or replace function sr_planilha_interno.pode_criar_sr(
  p_origem_revisao text, p_linha_origem text, p_numero_sr text
) returns boolean language plpgsql stable security invoker set search_path = '' as $regra$
declare ano_ref integer;
begin
  if auth.uid() is null or not coalesce(sr_planilha_interno.pode_editar(), false)
    or p_origem_revisao is null or p_numero_sr is null or btrim(p_numero_sr) = ''
    or p_linha_origem is null or p_linha_origem !~ '^portal:(2025|2026):'
    or p_numero_sr <> regexp_replace(upper(btrim(p_numero_sr)), '\s+', '', 'g') then
    return false;
  end if;
  ano_ref := split_part(p_linha_origem, ':', 2)::integer;
  if p_linha_origem <> 'portal:' || ano_ref || ':' || p_numero_sr then return false; end if;
  if not exists(select 1 from public.perfis_usuarios p where p.id = auth.uid() and p.ativo is true
    and (p.perfil = 'administrador' or p.permissoes -> ('chamados_' || ano_ref) = 'true'::jsonb)) then
    return false;
  end if;
  return exists(select 1 from public.sr_planilha_registros r
      where r.origem_revisao = p_origem_revisao and r.linha_origem not like 'portal:%')
    and exists(select 1 from public.chamados_oracle c where c.ano = ano_ref
      and regexp_replace(upper(btrim(c.numero_sr)), '\s+', '', 'g') = p_numero_sr);
end;
$regra$;

alter table public.sr_planilha_registros enable row level security;
alter table public.sr_planilha_versoes enable row level security;
grant usage on schema public, sr_planilha_interno to authenticated;
-- Autor, datas, versão e identificador são atribuídos pelo banco.
grant insert(origem_revisao, linha_origem, numero_sr, valores, aging_calculado)
on public.sr_planilha_registros to authenticated;
drop policy if exists sr_planilha_cadastro_portal on public.sr_planilha_registros;
create policy sr_planilha_cadastro_portal on public.sr_planilha_registros for insert to authenticated
with check (not aging_calculado and sr_planilha_interno.pode_criar_sr(origem_revisao, linha_origem, numero_sr));
drop policy if exists sr_planilha_cadastro_restrito on public.sr_planilha_registros;
create policy sr_planilha_cadastro_restrito on public.sr_planilha_registros as restrictive for insert to authenticated
with check (not aging_calculado and sr_planilha_interno.pode_criar_sr(origem_revisao, linha_origem, numero_sr));

create or replace function sr_planilha_interno.validar_registro()
returns trigger language plpgsql security invoker set search_path = '' as $validar$
declare i integer;
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
    if auth.uid() is null or not coalesce(sr_planilha_interno.pode_editar(), false) then
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
    if auth.uid() is not null and (new.aging_calculado or not coalesce(
      sr_planilha_interno.pode_criar_sr(new.origem_revisao, new.linha_origem, new.numero_sr), false)) then
      raise exception using errcode = '42501', message = 'Seu perfil não permite cadastrar esta SR.';
    end if;
    new.versao := 1;
  end if;
  new.atualizado_em := clock_timestamp(); new.atualizado_por := auth.uid();
  if auth.uid() is not null then
    select p.nome, p.email into new.atualizado_nome, new.atualizado_email
    from public.perfis_usuarios p where p.id = auth.uid() and p.ativo is true;
  else
    new.atualizado_nome := null; new.atualizado_email := null;
  end if;
  return new;
end;
$validar$;

create or replace function public.criar_sr_planilha_com_log(
  p_origem_revisao text, p_numero_sr text, p_ano integer, p_alteracoes jsonb, p_aba text
) returns public.sr_planilha_registros language plpgsql security invoker set search_path = '' as $criar$
declare
  numero text; linha text; novos_valores jsonb; item record; resultado public.sr_planilha_registros;
begin
  numero := regexp_replace(upper(btrim(p_numero_sr)), '\s+', '', 'g');
  linha := 'portal:' || p_ano || ':' || numero;
  if p_aba is null or p_aba not in ('sr', 'consolidado') or p_ano is null or p_ano not in (2025, 2026)
    or not coalesce(sr_planilha_interno.pode_visualizar_aba(p_aba), false)
    or not coalesce(sr_planilha_interno.pode_criar_sr(p_origem_revisao, linha, numero), false) then
    raise exception using errcode = '42501', message = 'Somente Administrador e Gestor autorizados podem cadastrar esta SR.';
  end if;
  if p_alteracoes is null or jsonb_typeof(p_alteracoes) <> 'object' or p_alteracoes = '{}'::jsonb then
    raise exception 'Preencha pelo menos um campo da SR.';
  end if;
  -- Serializa cadastros do mesmo número na mesma revisão; nunca atualiza outro cadastro.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_origem_revisao || ':' || numero, 0));
  if exists(select 1 from public.sr_planilha_registros r where r.origem_revisao = p_origem_revisao
    and regexp_replace(upper(btrim(r.numero_sr)), '\s+', '', 'g') = numero) then
    raise exception using errcode = '40001', message = 'Esta SR já tem um registro na planilha. Recarregue e revise seus rascunhos antes de salvar.';
  end if;
  select jsonb_agg('null'::jsonb order by i) into novos_valores from generate_series(0, 24) i;
  novos_valores := jsonb_set(novos_valores, array['2'], to_jsonb(numero), false);
  for item in select * from jsonb_each(p_alteracoes) loop
    if item.key !~ '^(0|[1-9]|1[0-9]|2[0-4])$' or item.key = '2' then raise exception 'Coluna inválida ou número de SR fixo.'; end if;
    if jsonb_typeof(item.value) not in ('string', 'number', 'boolean', 'null') then raise exception 'Tipo de valor inválido.'; end if;
    novos_valores := jsonb_set(novos_valores, array[item.key], item.value, false);
  end loop;
  perform set_config('pluma.aba_salvamento', p_aba, true);
  insert into public.sr_planilha_registros(origem_revisao, linha_origem, numero_sr, valores, aging_calculado)
  values(p_origem_revisao, linha, numero, novos_valores, false) returning * into resultado;
  return resultado;
exception when unique_violation then
  raise exception using errcode = '40001', message = 'Esta SR foi cadastrada por outra pessoa. Recarregue e revise seus rascunhos.';
end;
$criar$;

-- O gatilho privado é o único gravador do histórico, como na V10.
create or replace function sr_planilha_interno.registrar_versao()
returns trigger language plpgsql security definer set search_path = '' as $versao$
declare diferencas jsonb := '[]'::jsonb; anterior_em timestamptz; anterior jsonb; i integer;
begin
  if auth.uid() is not null and (new.atualizado_por is distinct from auth.uid()
    or not exists(select 1 from public.perfis_usuarios p where p.id = auth.uid() and p.ativo is true)) then
    raise exception using errcode = '42501', message = 'Autor da alteração inválido.';
  end if;
  if tg_op = 'UPDATE' and auth.uid() is null then
    raise exception using errcode = '42501', message = 'Autor da alteração inválido.';
  end if;
  for i in 0..24 loop
    anterior := null; anterior_em := null;
    if tg_op = 'UPDATE' then
      if new.valores -> i is not distinct from old.valores -> i then continue; end if;
      anterior := old.valores -> i;
      select v.alterado_em into anterior_em from public.sr_planilha_versoes v where v.registro_id = new.id
        and (v.versao = 1 or v.alteracoes @> jsonb_build_array(jsonb_build_object('coluna', i)))
        order by v.versao desc limit 1;
    elsif auth.uid() is null or new.valores -> i = 'null'::jsonb or new.valores ->> i = '' then
      continue;
    end if;
    diferencas := diferencas || jsonb_build_array(jsonb_build_object('coluna', i, 'anterior', anterior,
      'novo', new.valores -> i, 'anterior_em', anterior_em, 'novo_em', new.atualizado_em,
      'usuario_nome', new.atualizado_nome, 'usuario_email', new.atualizado_email));
  end loop;
  insert into public.sr_planilha_versoes(registro_id, versao, valores, alteracoes, acao, usuario_id, usuario_nome, usuario_email, alterado_em)
  values(new.id, new.versao, new.valores, diferencas,
    case when tg_op = 'INSERT' and auth.uid() is null then 'carga_inicial' else 'edicao' end,
    auth.uid(), new.atualizado_nome, new.atualizado_email, new.atualizado_em);
  return new;
end;
$versao$;

create or replace function sr_planilha_interno.auditar_salvamento_aba()
returns trigger language plpgsql security definer set search_path = '' as $log$
declare ator public.perfis_usuarios; aba_nome text; campos jsonb; ref text; v integer; ano_ref integer;
begin
  if auth.uid() is null then return new; end if;
  select * into ator from public.perfis_usuarios where id = auth.uid();
  if not found or ator.ativo is not true then raise exception using errcode = '42501', message = 'Autor do salvamento inválido.'; end if;
  if tg_table_name = 'sr_planilha_registros' then
    aba_nome := nullif(current_setting('pluma.aba_salvamento', true), '');
    if aba_nome is null or aba_nome not in ('sr', 'consolidado') then
      aba_nome := case when sr_planilha_interno.pode_visualizar_aba('sr') then 'sr' else 'consolidado' end;
    end if;
    if tg_op = 'INSERT' then
      select coalesce(jsonb_agg(i), '[]'::jsonb) into campos from generate_series(0, 24) i
      where new.valores -> i <> 'null'::jsonb and new.valores ->> i <> '';
    else
      select coalesce(jsonb_agg(i), '[]'::jsonb) into campos from generate_series(0, 24) i
      where new.valores -> i is distinct from old.valores -> i;
    end if;
    ref := new.numero_sr; v := new.versao;
    ano_ref := case when new.linha_origem ~ '^portal:(2025|2026):' then split_part(new.linha_origem, ':', 2)::integer else null end;
  else
    aba_nome := 'planilha'; ref := new.numero_sr; v := new.portal_versao; ano_ref := new.ano;
    select coalesce(jsonb_agg(k), '[]'::jsonb) into campos
    from jsonb_object_keys(to_jsonb(new) - array['portal_versao','portal_atualizado_em','portal_atualizado_por','portal_atualizado_nome','portal_atualizado_email']) k
    where to_jsonb(new) -> k is distinct from to_jsonb(old) -> k;
  end if;
  insert into public.logs_abas_portal(usuario_id,usuario_nome,usuario_email,perfil,aba,acao,origem,ano,referencia,quantidade,detalhes)
  values(ator.id,ator.nome,ator.email,ator.perfil,aba_nome,'salvamento','banco',ano_ref,ref,jsonb_array_length(campos),
    jsonb_build_object('versao',v,'campos',campos,'registro_id',new.id,'operacao',case when tg_op = 'INSERT' then 'cadastro' else 'edicao' end));
  return new;
end;
$log$;
drop trigger if exists zz_portal_log_sr on public.sr_planilha_registros;
create trigger zz_portal_log_sr after insert or update on public.sr_planilha_registros
for each row execute function sr_planilha_interno.auditar_salvamento_aba();

revoke execute on function sr_planilha_interno.pode_criar_sr(text,text,text),
  public.criar_sr_planilha_com_log(text,text,integer,jsonb,text) from public, anon, authenticated;
grant execute on function sr_planilha_interno.pode_criar_sr(text,text,text),
  public.criar_sr_planilha_com_log(text,text,integer,jsonb,text) to authenticated;
revoke execute on function sr_planilha_interno.validar_registro(), sr_planilha_interno.registrar_versao(),
  sr_planilha_interno.auditar_salvamento_aba() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
select 'V11 instalada: SRs sem registro podem ser cadastradas com autoria, versões e logs.' as resultado;
