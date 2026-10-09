-- V13 — versão independente por coluna × linha e importação semanal da SR.
-- Execute TODO este arquivo após a V12. Preserva dados e históricos anteriores.
begin;
do $requisitos$
begin
  if to_regclass('public.sr_consolidado_comentarios') is null or to_regclass('public.chamados_oracle_versoes') is null then
    raise exception 'Instale primeiro a V12 e a SR versionada do portal.';
  end if;
end;
$requisitos$;
alter table public.sr_planilha_registros add column if not exists versoes_celulas jsonb not null default '{}';
alter table public.chamados_oracle add column if not exists versoes_celulas jsonb not null default '{}';
alter table public.sr_consolidado_comentarios add column if not exists versoes_celulas jsonb not null default '{}';
create table if not exists public.consolidado_importacoes (
  id uuid primary key default gen_random_uuid(), ano integer not null check(ano in (2025,2026)),
  arquivo text not null, hash_arquivo text, usuario_id uuid not null, usuario_nome text, usuario_email text,
  importado_em timestamptz not null default clock_timestamp(), linhas jsonb not null,
  linhas_novas integer not null default 0, celulas_alteradas integer not null default 0
);
create table if not exists public.consolidado_celulas_versoes (
  fonte text not null check(fonte in ('sr','chamado','comentario')), linha text not null,
  coluna text not null, versao integer not null check(versao>0), numero_sr text not null, ano integer,
  anterior jsonb, novo jsonb, origem text not null check(origem in ('planilha','painel','legado','banco')),
  arquivo text, importacao_id uuid references public.consolidado_importacoes(id),
  usuario_id uuid, usuario_nome text, usuario_email text, alterado_em timestamptz not null,
  primary key(fonte,linha,coluna,versao)
);
create index if not exists celulas_importacao_idx on public.consolidado_celulas_versoes(importacao_id);
create index if not exists celulas_sr_idx on public.consolidado_celulas_versoes(numero_sr,ano);
create table if not exists sr_planilha_interno.base_importada (
  registro_id uuid primary key references public.sr_planilha_registros(id), valores jsonb not null
);
alter table public.consolidado_importacoes enable row level security;
alter table public.consolidado_celulas_versoes enable row level security;
alter table sr_planilha_interno.base_importada enable row level security;
revoke all on public.consolidado_importacoes, public.consolidado_celulas_versoes,
  sr_planilha_interno.base_importada from public,anon,authenticated;
grant select on public.consolidado_importacoes, public.consolidado_celulas_versoes to authenticated;
drop policy if exists celulas_consulta on public.consolidado_celulas_versoes;
create policy celulas_consulta on public.consolidado_celulas_versoes for select to authenticated using(
  case fonte when 'sr' then sr_planilha_interno.pode_consultar()
    when 'comentario' then sr_planilha_interno.pode_consultar_comentarios(ano)
    else sr_planilha_interno.pode_consultar_chamado(ano) end);
drop policy if exists importacoes_consulta on public.consolidado_importacoes;
create policy importacoes_consulta on public.consolidado_importacoes for select to authenticated
using(sr_planilha_interno.pode_consultar_comentarios(ano));

create or replace function sr_planilha_interno.normalizar_celula(v jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select case when v is null or v='null'::jsonb or v='""'::jsonb then 'null'::jsonb else v end;
$$;
create or replace function sr_planilha_interno.registrar_celula(
  f text,l text,c text,sr text,a integer,antes jsonb,depois jsonb,o text,arq text,
  uid uuid,nome text,email text,em timestamptz,carga uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $celula$
declare ultima public.consolidado_celulas_versoes; proxima integer;
begin
  select * into ultima from public.consolidado_celulas_versoes where fonte=f and linha=l and coluna=c order by versao desc limit 1;
  if found and sr_planilha_interno.normalizar_celula(ultima.novo)=sr_planilha_interno.normalizar_celula(depois) then
    return jsonb_build_object('versao',ultima.versao,'origem',ultima.origem,'arquivo',ultima.arquivo,'alterado_em',ultima.alterado_em,'usuario_nome',ultima.usuario_nome,'usuario_email',ultima.usuario_email);
  end if;
  if ultima.versao is null and f='comentario' and sr_planilha_interno.normalizar_celula(depois)='null'::jsonb then return null; end if;
  proxima:=coalesce(ultima.versao,0)+1;
  insert into public.consolidado_celulas_versoes(fonte,linha,coluna,versao,numero_sr,ano,anterior,novo,origem,arquivo,usuario_id,usuario_nome,usuario_email,alterado_em,importacao_id)
  values(f,l,c,proxima,sr,a,coalesce(ultima.novo,antes),depois,o,arq,uid,nome,email,em,carga);
  return jsonb_build_object('versao',proxima,'origem',o,'arquivo',arq,'alterado_em',em,'usuario_nome',nome,'usuario_email',email);
end;
$celula$;

-- Reconstitui cada célula pelas versões já existentes, uma vez. O contador da
-- linha antiga fica apenas para compatibilidade; o controle novo é por célula.
do $migrar$
declare v record; i integer; item record; tr record;
begin
  if exists(select 1 from sr_planilha_interno.atualizacoes_portal where chave='celulas_v13') then return; end if;
  for v in select r.numero_sr,h.* from public.sr_planilha_versoes h join public.sr_planilha_registros r on r.id=h.registro_id order by h.registro_id,h.versao loop
    for i in 0..24 loop
      perform sr_planilha_interno.registrar_celula('sr',v.registro_id::text,i::text,btrim(v.numero_sr),null,null,v.valores->i,
        case when v.acao='carga_inicial' then 'planilha' else 'painel' end,
        case when v.acao='carga_inicial' then 'Carga inicial da planilha SR (arquivo anterior)' else null end,
        v.usuario_id,v.usuario_nome,v.usuario_email,v.alterado_em);
    end loop;
  end loop;
  for v in select * from public.chamados_oracle_versoes order by ano,numero_sr,versao loop
    for item in select * from jsonb_each(v.depois - array['id','ano','dados_originais','versoes_celulas','portal_versao','portal_atualizado_em','portal_atualizado_por','portal_atualizado_nome','portal_atualizado_email']) loop
      perform sr_planilha_interno.registrar_celula('chamado',v.ano||':'||regexp_replace(upper(btrim(v.numero_sr)),'\s+','','g'),item.key,v.numero_sr,v.ano,null,item.value,
        case when v.acao='carga_inicial' then 'legado' when v.usuario_id is null then 'banco' else 'painel' end,null,v.usuario_id,v.usuario_nome,v.usuario_email,v.alterado_em);
    end loop;
  end loop;
  for v in select * from public.sr_consolidado_comentarios_versoes order by ano,numero_sr,versao loop
    for item in select * from jsonb_each(v.depois) loop
      perform sr_planilha_interno.registrar_celula('comentario',v.ano||':'||v.numero_sr,item.key,v.numero_sr,v.ano,null,item.value,'painel',null,v.usuario_id,v.usuario_nome,v.usuario_email,v.alterado_em);
    end loop;
  end loop;
  insert into sr_planilha_interno.base_importada(registro_id,valores)
  select r.id,coalesce((select h.valores from public.sr_planilha_versoes h where h.registro_id=r.id order by h.versao limit 1),r.valores)
  from public.sr_planilha_registros r on conflict do nothing;
  -- Guarda o estado dos gatilhos; a atualização dos metadados não representa
  -- edição de dados nem deve criar novas versões antigas de linha.
  create temporary table v13_gatilhos on commit drop as select n.nspname esquema,c.relname tabela,t.tgname nome,t.tgenabled estado
  from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and t.tgenabled<>'D' and n.nspname='public' and c.relname in ('sr_planilha_registros','chamados_oracle','sr_consolidado_comentarios');
  for tr in select * from v13_gatilhos loop execute format('alter table %I.%I disable trigger %I',tr.esquema,tr.tabela,tr.nome); end loop;
  update public.sr_planilha_registros r set versoes_celulas=coalesce((select jsonb_object_agg(coluna,jsonb_build_object('versao',versao,'origem',origem,'arquivo',arquivo,'alterado_em',alterado_em,'usuario_nome',usuario_nome,'usuario_email',usuario_email))
    from (select distinct on(coluna) * from public.consolidado_celulas_versoes where fonte='sr' and linha=r.id::text order by coluna,versao desc) x),'{}');
  update public.chamados_oracle r set versoes_celulas=coalesce((select jsonb_object_agg(coluna,jsonb_build_object('versao',versao,'origem',origem,'arquivo',arquivo,'alterado_em',alterado_em,'usuario_nome',usuario_nome,'usuario_email',usuario_email))
    from (select distinct on(coluna) * from public.consolidado_celulas_versoes where fonte='chamado' and linha=r.ano||':'||regexp_replace(upper(btrim(r.numero_sr)),'\s+','','g') order by coluna,versao desc) x),'{}');
  update public.sr_consolidado_comentarios r set versoes_celulas=coalesce((select jsonb_object_agg(coluna,jsonb_build_object('versao',versao,'origem',origem,'arquivo',arquivo,'alterado_em',alterado_em,'usuario_nome',usuario_nome,'usuario_email',usuario_email))
    from (select distinct on(coluna) * from public.consolidado_celulas_versoes where fonte='comentario' and linha=r.ano||':'||r.numero_sr order by coluna,versao desc) x),'{}');
  for tr in select * from v13_gatilhos loop execute format('alter table %I.%I enable %s trigger %I',tr.esquema,tr.tabela,case tr.estado when 'A' then 'always' when 'R' then 'replica' else '' end,tr.nome); end loop;
  insert into sr_planilha_interno.atualizacoes_portal(chave) values('celulas_v13');
end;
$migrar$;

-- Exclui o mapa de metadados do histórico antigo dos chamados.
do $compatibilidade$
declare assinatura text; definicao text;
begin
  foreach assinatura in array array['sr_planilha_interno.validar_chamado()','sr_planilha_interno.registrar_chamado_versao()','sr_planilha_interno.auditar_salvamento_aba()'] loop
    select pg_get_functiondef(to_regprocedure(assinatura)) into definicao;
    if definicao is not null then execute replace(definicao,'array[''portal_versao''','array[''versoes_celulas'',''portal_versao'''); end if;
  end loop;
end;
$compatibilidade$;

create or replace function sr_planilha_interno.capturar_celulas()
returns trigger language plpgsql security definer set search_path='' as $capturar$
declare f text; l text; sr text; a integer; campos jsonb; anteriores jsonb; item record; info jsonb; carga public.consolidado_importacoes; origem text; ator public.perfis_usuarios;
begin
  select * into ator from public.perfis_usuarios where id=auth.uid();
  if auth.uid() is not null and (not found or ator.ativo is not true) then raise exception using errcode='42501',message='Autor ativo necessário.'; end if;
  if nullif(current_setting('pluma.importacao_id',true),'') is not null then
    select * into carga from public.consolidado_importacoes where id=current_setting('pluma.importacao_id',true)::uuid and usuario_id=auth.uid();
  end if;
  origem:=case when carga.id is not null then 'planilha' when auth.uid() is null then 'banco' else 'painel' end;
  if tg_table_name='sr_planilha_registros' then
    f:='sr'; l:=new.id::text; sr:=btrim(new.numero_sr); a:=carga.ano;
    select jsonb_object_agg(i::text,new.valores->i) into campos from generate_series(0,24) i;
    if tg_op='UPDATE' then select jsonb_object_agg(i::text,old.valores->i) into anteriores from generate_series(0,24) i; end if;
  elsif tg_table_name='sr_consolidado_comentarios' then
    f:='comentario'; sr:=new.numero_sr; a:=new.ano; l:=a||':'||sr;
    campos:=jsonb_build_object('comentarios_pmo',new.comentarios_pmo,'comentarios_pluma',new.comentarios_pluma);
    if tg_op='UPDATE' then anteriores:=jsonb_build_object('comentarios_pmo',old.comentarios_pmo,'comentarios_pluma',old.comentarios_pluma); end if;
  else
    f:='chamado'; sr:=new.numero_sr; a:=new.ano; l:=a||':'||regexp_replace(upper(btrim(sr)),'\s+','','g');
    campos:=to_jsonb(new)-array['id','ano','dados_originais','versoes_celulas','portal_versao','portal_atualizado_em','portal_atualizado_por','portal_atualizado_nome','portal_atualizado_email'];
    if tg_op='UPDATE' then anteriores:=to_jsonb(old); end if;
  end if;
  for item in select * from jsonb_each(campos) loop
    if tg_op='UPDATE' and sr_planilha_interno.normalizar_celula(anteriores->item.key)=sr_planilha_interno.normalizar_celula(item.value) then continue; end if;
    info:=sr_planilha_interno.registrar_celula(f,l,item.key,sr,a,anteriores->item.key,item.value,origem,carga.arquivo,auth.uid(),ator.nome,ator.email,clock_timestamp(),carga.id);
    if info is not null then new.versoes_celulas:=jsonb_set(new.versoes_celulas,array[item.key],info,true); end if;
  end loop;
  return new;
end;
$capturar$;
drop trigger if exists zz_celulas_sr on public.sr_planilha_registros;
create trigger zz_celulas_sr before insert or update on public.sr_planilha_registros for each row execute function sr_planilha_interno.capturar_celulas();
drop trigger if exists zz_celulas_chamado on public.chamados_oracle;
create trigger zz_celulas_chamado before insert or update on public.chamados_oracle for each row execute function sr_planilha_interno.capturar_celulas();
drop trigger if exists zz_celulas_comentarios on public.sr_consolidado_comentarios;
create trigger zz_celulas_comentarios before insert or update on public.sr_consolidado_comentarios for each row execute function sr_planilha_interno.capturar_celulas();

create or replace function sr_planilha_interno.conferir_versao_celula(mapa jsonb,esperadas jsonb,campo text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if esperadas is null or jsonb_typeof(esperadas->campo)<>'number' or (esperadas->>campo) !~ '^\d+$'
    or coalesce((mapa->campo->>'versao')::integer,0) is distinct from (esperadas->>campo)::integer then
    raise exception using errcode='40001',message='A coluna '||campo||' desta linha foi alterada por outra pessoa. Recarregue e compare seu rascunho.';
  end if;
end;
$$;
create or replace function public.salvar_sr_celulas(p_registro_id uuid,p_versoes jsonb,p_alteracoes jsonb,p_aba text)
returns public.sr_planilha_registros language plpgsql security invoker set search_path='' as $$
declare r public.sr_planilha_registros; item record; novos jsonb; resultado public.sr_planilha_registros;
begin
  if p_aba not in ('sr','consolidado') or not coalesce(sr_planilha_interno.pode_visualizar_aba(p_aba) and sr_planilha_interno.pode_editar(),false) then raise exception using errcode='42501',message='Edição não autorizada.'; end if;
  if p_alteracoes is null or jsonb_typeof(p_alteracoes)<>'object' or p_alteracoes='{}' then raise exception 'Informe as células alteradas.'; end if;
  select * into r from public.sr_planilha_registros where id=p_registro_id for update;
  if not found then raise exception 'Linha não encontrada.'; end if;
  novos:=r.valores;
  for item in select * from jsonb_each(p_alteracoes) loop
    if item.key !~ '^(0|[1-9]|1[0-9]|2[0-4])$' or item.key='2' or (item.key='9' and r.aging_calculado)
      or jsonb_typeof(item.value) not in ('string','number','boolean','null') then raise exception 'Coluna não editável.'; end if;
    perform sr_planilha_interno.conferir_versao_celula(r.versoes_celulas,p_versoes,item.key);
    novos:=jsonb_set(novos,array[item.key],item.value,false);
  end loop;
  perform set_config('pluma.aba_salvamento',p_aba,true);
  if novos=r.valores then return r; end if;
  update public.sr_planilha_registros set valores=novos where id=r.id returning * into resultado;
  return resultado;
end;
$$;
create or replace function public.salvar_comentarios_celulas(p_ano integer,p_numero_sr text,p_versoes jsonb,p_alteracoes jsonb)
returns public.sr_consolidado_comentarios language plpgsql security invoker set search_path='' as $$
declare r public.sr_consolidado_comentarios; resultado public.sr_consolidado_comentarios; item record; numero text;
begin
  numero:=regexp_replace(upper(btrim(p_numero_sr)),'\s+','','g');
  if not coalesce(sr_planilha_interno.pode_editar_comentarios(p_ano),false) then raise exception using errcode='42501',message='Edição não autorizada.'; end if;
  if p_alteracoes is null or jsonb_typeof(p_alteracoes)<>'object' or p_alteracoes='{}' then raise exception 'Informe as células alteradas.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('consolidado-comentarios:'||p_ano||':'||numero,0));
  select * into r from public.sr_consolidado_comentarios where ano=p_ano and numero_sr=numero for update;
  for item in select * from jsonb_each(p_alteracoes) loop
    if item.key not in ('comentarios_pmo','comentarios_pluma') or jsonb_typeof(item.value)<>'string' then raise exception 'Coluna inválida.'; end if;
    perform sr_planilha_interno.conferir_versao_celula(coalesce(r.versoes_celulas,'{}'),p_versoes,item.key);
  end loop;
  if r.numero_sr is null then
    insert into public.sr_consolidado_comentarios(ano,numero_sr,comentarios_pmo,comentarios_pluma)
    values(p_ano,numero,coalesce(p_alteracoes->>'comentarios_pmo',''),coalesce(p_alteracoes->>'comentarios_pluma','')) returning * into resultado;
  elsif coalesce(p_alteracoes->>'comentarios_pmo',r.comentarios_pmo)=r.comentarios_pmo and coalesce(p_alteracoes->>'comentarios_pluma',r.comentarios_pluma)=r.comentarios_pluma then return r;
  else
    update public.sr_consolidado_comentarios set comentarios_pmo=coalesce(p_alteracoes->>'comentarios_pmo',r.comentarios_pmo),comentarios_pluma=coalesce(p_alteracoes->>'comentarios_pluma',r.comentarios_pluma)
    where ano=p_ano and numero_sr=numero returning * into resultado;
  end if;
  return resultado;
end;
$$;

-- Só a importação autorizada pode inserir linhas novas originadas da planilha.
-- A função de validação V11 continua validando identidade, tipos e Aging.
do $permitir_carga$
declare definicao text;
begin
  select pg_get_functiondef('sr_planilha_interno.validar_registro()'::regprocedure) into definicao;
  if position('importacao_autorizada' in definicao)=0 then
    definicao:=replace(definicao,'if auth.uid() is not null and (new.aging_calculado or not coalesce(',
      'if auth.uid() is not null and not sr_planilha_interno.importacao_autorizada(new.origem_revisao,new.numero_sr) and (new.aging_calculado or not coalesce(');
    if position('importacao_autorizada' in definicao)=0 then raise exception 'A função de validação da SR não corresponde à V11. Atualize a V11 antes da V13.'; end if;
    execute definicao;
  end if;
end;
$permitir_carga$;
create or replace function sr_planilha_interno.importacao_autorizada(revisao text,numero text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.consolidado_importacoes i
    where i.id::text=nullif(current_setting('pluma.importacao_id',true),'') and i.usuario_id=auth.uid()
      and sr_planilha_interno.pode_editar_comentarios(i.ano)
      and exists(select 1 from public.sr_planilha_registros r where r.origem_revisao=revisao)
      and exists(select 1 from public.chamados_oracle c where c.ano=i.ano and regexp_replace(upper(btrim(c.numero_sr)),'\s+','','g')=numero));
$$;

create or replace function sr_planilha_interno.prever_carga(p_revisao text,p_ano integer,p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path='' as $prever$
declare entrada jsonb; r public.sr_planilha_registros; numero text; quantidade integer; baseline jsonb; esperadas jsonb; alteracoes jsonb; alvos jsonb; i integer; lista jsonb:='[]'; ignoradas integer:=0; novos integer:=0; total integer:=0; usados uuid[]:='{}'; registro_id uuid; novo boolean;
begin
  if auth.uid() is null or not coalesce(sr_planilha_interno.pode_editar_comentarios(p_ano),false) then raise exception using errcode='42501',message='Importação não autorizada.'; end if;
  if p_linhas is null or jsonb_typeof(p_linhas)<>'array' or jsonb_array_length(p_linhas) not between 1 and 5000
    or not exists(select 1 from public.sr_planilha_registros where origem_revisao=p_revisao) then raise exception 'Arquivo ou revisão inválidos.'; end if;
  for entrada in select * from jsonb_array_elements(p_linhas) loop
    if jsonb_typeof(entrada->'valores')<>'array' or jsonb_array_length(entrada->'valores')<>25 then raise exception 'A planilha deve ter os 25 campos da SR.'; end if;
    for i in 0..24 loop
      if jsonb_typeof(entrada->'valores'->i) not in ('string','number','boolean','null') or length(entrada->'valores'->>i)>20000 then raise exception 'Valor inválido na coluna %.',i; end if;
    end loop;
    numero:=regexp_replace(upper(btrim(entrada->'valores'->>2)),'\s+','','g');
    if numero is null or numero='' then raise exception 'SR sem número.'; end if;
    if not exists(select 1 from public.chamados_oracle c where c.ano=p_ano and regexp_replace(upper(btrim(c.numero_sr)),'\s+','','g')=numero) then ignoradas:=ignoradas+1;continue;end if;
    r:=null;
    if nullif(entrada->>'id','') is not null then
      select * into r from public.sr_planilha_registros where id=(entrada->>'id')::uuid and origem_revisao=p_revisao and regexp_replace(upper(btrim(numero_sr)),'\s+','','g')=numero;
      if not found then raise exception 'ID de linha inválido para a SR %.',numero;end if;
    else
      select count(*) into quantidade from public.sr_planilha_registros where origem_revisao=p_revisao and regexp_replace(upper(btrim(numero_sr)),'\s+','','g')=numero;
      if quantidade>1 then raise exception 'A SR % tem linhas repetidas. Use Baixar modelo semanal para manter o ID fixo de cada linha.',numero; end if;
      select * into r from public.sr_planilha_registros where origem_revisao=p_revisao and regexp_replace(upper(btrim(numero_sr)),'\s+','','g')=numero;
    end if;
    novo:=r.id is null; registro_id:=coalesce(r.id,gen_random_uuid());
    if registro_id=any(usados) or (novo and exists(select 1 from jsonb_array_elements(lista) x where x->>'numero_sr'=numero)) then raise exception 'Linha ou SR nova repetida no arquivo: %.',numero;end if;
    usados:=array_append(usados,registro_id);
    select valores into baseline from sr_planilha_interno.base_importada b where b.registro_id=r.id;
    baseline:=coalesce(baseline,r.valores,jsonb_build_array()); esperadas:='{}';alteracoes:='[]';alvos:='[]';
    for i in 0..24 loop
      if i=2 or (i=9 and coalesce(r.aging_calculado,false)) then continue;end if;
      if novo or sr_planilha_interno.normalizar_celula(entrada->'valores'->i)<>sr_planilha_interno.normalizar_celula(baseline->i) then
        esperadas:=esperadas||jsonb_build_object(i::text,coalesce((r.versoes_celulas->i::text->>'versao')::integer,0));
        alvos:=alvos||to_jsonb(i);
        if novo or sr_planilha_interno.normalizar_celula(entrada->'valores'->i)<>sr_planilha_interno.normalizar_celula(r.valores->i) then
          alteracoes:=alteracoes||jsonb_build_array(jsonb_build_object('coluna',i,'anterior',r.valores->i,'novo',entrada->'valores'->i)); total:=total+1;
        end if;
      end if;
    end loop;
    if novo then novos:=novos+1;end if;
    lista:=lista||jsonb_build_array(jsonb_build_object('id',registro_id,'novo',novo,'numero_sr',numero,'valores',jsonb_set(entrada->'valores',array['2'],to_jsonb(numero)),
      'baseline',baseline,'esperadas',esperadas,'alvos',alvos,'alteracoes',alteracoes,'aging_formula',coalesce((entrada->>'aging_formula')::boolean,false)));
  end loop;
  return jsonb_build_object('revisao',p_revisao,'ano',p_ano,'linhas',lista,'ignoradas',ignoradas,'novas',novos,'celulas',total);
end;
$prever$;
create or replace function public.prever_importacao_sr(p_revisao text,p_ano integer,p_linhas jsonb)
returns jsonb language sql security invoker set search_path='' as $$select sr_planilha_interno.prever_carga(p_revisao,p_ano,p_linhas)$$;

create or replace function sr_planilha_interno.aplicar_carga(p_previa jsonb,p_arquivo text,p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $importar$
declare carga uuid; entrada jsonb; r public.sr_planilha_registros; baseline jsonb; novos_valores jsonb; i integer; ano_ref integer; revisao text; ator public.perfis_usuarios; novas integer:=0; alteradas integer:=0; normal_numero text; valor jsonb;
begin
  ano_ref:=(p_previa->>'ano')::integer;revisao:=p_previa->>'revisao';
  if auth.uid() is null or not coalesce(sr_planilha_interno.pode_editar_comentarios(ano_ref),false) then raise exception using errcode='42501',message='Importação não autorizada.';end if;
  if p_arquivo is null or length(p_arquivo) not between 1 and 255 or p_previa->'linhas' is null or jsonb_typeof(p_previa->'linhas')<>'array' or jsonb_array_length(p_previa->'linhas') not between 1 and 5000 then raise exception 'Prévia ou nome do arquivo inválidos.';end if;
  select * into ator from public.perfis_usuarios where id=auth.uid();
  perform pg_advisory_xact_lock(hashtextextended('importacao-sr:'||revisao,0));
  insert into public.consolidado_importacoes(ano,arquivo,hash_arquivo,usuario_id,usuario_nome,usuario_email,linhas)
  values(ano_ref,p_arquivo,p_hash,ator.id,ator.nome,ator.email,p_previa->'linhas') returning id into carga;
  perform set_config('pluma.importacao_id',carga::text,true);perform set_config('pluma.aba_salvamento','consolidado',true);
  for entrada in select * from jsonb_array_elements(p_previa->'linhas') order by value->>'id' loop
    if jsonb_typeof(entrada->'valores')<>'array' or jsonb_array_length(entrada->'valores')<>25 then raise exception 'Estrutura da linha inválida.';end if;
    normal_numero:=regexp_replace(upper(btrim(entrada->'valores'->>2)),'\s+','','g');
    if normal_numero is null or normal_numero='' or not exists(select 1 from public.chamados_oracle c where c.ano=ano_ref and regexp_replace(upper(btrim(c.numero_sr)),'\s+','','g')=normal_numero) then raise exception 'SR ou ano não autorizado.';end if;
    for i in 0..24 loop if jsonb_typeof(entrada->'valores'->i) not in ('string','number','boolean','null') or length(entrada->'valores'->>i)>20000 then raise exception 'Valor inválido.';end if;end loop;
    select * into r from public.sr_planilha_registros where id=(entrada->>'id')::uuid for update;
    if (entrada->>'novo')::boolean then
      if found or exists(select 1 from public.sr_planilha_registros where origem_revisao=revisao and regexp_replace(upper(btrim(numero_sr)),'\s+','','g')=normal_numero) then raise exception using errcode='40001',message='A SR foi cadastrada após a prévia. Carregue o arquivo novamente.';end if;
      insert into public.sr_planilha_registros(id,origem_revisao,linha_origem,numero_sr,valores,aging_calculado)
      values((entrada->>'id')::uuid,revisao,'importacao:'||(entrada->>'id'),normal_numero,entrada->'valores',coalesce((entrada->>'aging_formula')::boolean,false)) returning * into r;
      novas:=novas+1;alteradas:=alteradas+24;
    else
      if r.id is null or r.origem_revisao<>revisao or regexp_replace(upper(btrim(r.numero_sr)),'\s+','','g')<>normal_numero then raise exception 'Identificação de linha inválida.';end if;
      select valores into baseline from sr_planilha_interno.base_importada b where b.registro_id=r.id;
      baseline:=coalesce(baseline,r.valores);
      if baseline is distinct from entrada->'baseline' then raise exception using errcode='40001',message='Outra importação mudou a base após a prévia. Carregue o arquivo novamente.';end if;
      novos_valores:=r.valores;
      for i in 0..24 loop
        if i=2 or (i=9 and r.aging_calculado) then continue;end if;
        valor:=entrada->'valores'->i;
        if sr_planilha_interno.normalizar_celula(valor)<>sr_planilha_interno.normalizar_celula(baseline->i) then
          perform sr_planilha_interno.conferir_versao_celula(r.versoes_celulas,entrada->'esperadas',i::text);
          if sr_planilha_interno.normalizar_celula(valor)<>sr_planilha_interno.normalizar_celula(r.valores->i) then novos_valores:=jsonb_set(novos_valores,array[i::text],valor,false);alteradas:=alteradas+1;end if;
        end if;
      end loop;
      if novos_valores<>r.valores then update public.sr_planilha_registros set valores=novos_valores where id=r.id;end if;
    end if;
    insert into sr_planilha_interno.base_importada(registro_id,valores) values(r.id,entrada->'valores') on conflict(registro_id) do update set valores=excluded.valores;
  end loop;
  update public.consolidado_importacoes set linhas_novas=novas,celulas_alteradas=alteradas where id=carga;
  insert into public.logs_abas_portal(usuario_id,usuario_nome,usuario_email,perfil,aba,acao,origem,ano,quantidade,detalhes)
  values(ator.id,ator.nome,ator.email,ator.perfil,'consolidado','salvamento','banco',ano_ref,alteradas,jsonb_build_object('tipo','importacao_planilha','arquivo',p_arquivo,'importacao_id',carga,'linhas_novas',novas,'celulas',alteradas));
  perform set_config('pluma.importacao_id','',true);
  return jsonb_build_object('id',carga,'novas',novas,'celulas',alteradas);
end;
$importar$;
create or replace function public.importar_atualizacao_sr(p_previa jsonb,p_arquivo text,p_hash text)
returns jsonb language sql security invoker set search_path='' as $$select sr_planilha_interno.aplicar_carga(p_previa,p_arquivo,p_hash)$$;

-- Funções privilegiadas ficam em esquema privado, têm autorização explícita
-- e só as duas APIs de importação autorizadas podem chamá-las pelo portal.
revoke execute on function sr_planilha_interno.registrar_celula(text,text,text,text,integer,jsonb,jsonb,text,text,uuid,text,text,timestamptz,uuid),
  sr_planilha_interno.capturar_celulas(),sr_planilha_interno.prever_carga(text,integer,jsonb),sr_planilha_interno.aplicar_carga(jsonb,text,text),sr_planilha_interno.importacao_autorizada(text,text),
  sr_planilha_interno.normalizar_celula(jsonb),sr_planilha_interno.conferir_versao_celula(jsonb,jsonb,text),
  public.salvar_sr_celulas(uuid,jsonb,jsonb,text),public.salvar_comentarios_celulas(integer,text,jsonb,jsonb),
  public.prever_importacao_sr(text,integer,jsonb),public.importar_atualizacao_sr(jsonb,text,text) from public,anon,authenticated;
grant execute on function sr_planilha_interno.prever_carga(text,integer,jsonb),sr_planilha_interno.aplicar_carga(jsonb,text,text),sr_planilha_interno.importacao_autorizada(text,text),
  sr_planilha_interno.normalizar_celula(jsonb),sr_planilha_interno.conferir_versao_celula(jsonb,jsonb,text),
  public.salvar_sr_celulas(uuid,jsonb,jsonb,text),public.salvar_comentarios_celulas(integer,text,jsonb,jsonb),
  public.prever_importacao_sr(text,integer,jsonb),public.importar_atualizacao_sr(jsonb,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
select 'V13 instalada: versão por coluna × linha, origem Planilha/Painel e importação semanal.' as resultado;
