-- SUPORTE ORACLE — V18: identificação segura de SRs repetidas na base.
-- Execute TODO este arquivo no SQL Editor após a V17.
-- Não remove registros, altera dados, recria tabelas ou reprocessa históricos.
-- A confirmação da carga continua usando a mesma função da V17.
begin;
do $requisitos$
begin
  if to_regprocedure('sr_planilha_interno.acrescentar_valor_importado(jsonb,jsonb,jsonb)') is null
    or to_regprocedure('sr_planilha_interno.aplicar_carga(jsonb,text,text)') is null
    or to_regclass('sr_planilha_interno.base_importada') is null then
    raise exception 'Instale sql/ATUALIZAR_IMPORTACAO_ACRESCENTAR_V17.sql antes da V18.';
  end if;
end;
$requisitos$;

create or replace function sr_planilha_interno.prever_carga(p_revisao text,p_ano integer,p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path='' as $prever$
declare entrada jsonb; r public.sr_planilha_registros; numero text; quantidade integer; baseline jsonb; esperadas jsonb; alteracoes jsonb; alvos jsonb; i integer; lista jsonb:='[]'; ignoradas integer:=0; novos integer:=0; total integer:=0; usados uuid[]:='{}'; registro_id uuid; novo boolean; valor_final jsonb; candidatos uuid[]; conciliadas integer:=0;
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
      if quantidade>1 then
        -- Nunca usa a posição no Excel nem escolhe o primeiro UUID. Compara a
        -- última base recebida da planilha, preservando edições feitas no painel.
        -- O tipo de Aging distingue, por exemplo, a linha original 214 da 216.
        with opcoes as (
          select s.id, s.aging_calculado, coalesce(b.valores,s.valores) as base
          from public.sr_planilha_registros s
          left join sr_planilha_interno.base_importada b on b.registro_id=s.id
          where s.origem_revisao=p_revisao
            and regexp_replace(upper(btrim(s.numero_sr)),'\s+','','g')=numero
            and s.aging_calculado=coalesce((entrada->>'aging_formula')::boolean,false)
        ), pontuadas as (
          select o.id, case
            when not exists (
              select 1 from generate_series(0,24) as campo(indice)
              where indice<>2 and not (indice=9 and o.aging_calculado)
                and sr_planilha_interno.normalizar_celula(o.base->indice)
                  is distinct from sr_planilha_interno.normalizar_celula(entrada->'valores'->indice)
            ) then 2
            when not exists (
              select 1 from unnest(array[0,1,7,8]) as campo(indice)
              where btrim(coalesce(o.base->>indice,''),E' \t\r\n')
                is distinct from btrim(coalesce(entrada->'valores'->>indice,''),E' \t\r\n')
            ) then 1 else 0 end as prioridade
          from opcoes o
        )
        select coalesce(array_agg(p.id),'{}'::uuid[]) into candidatos
        from pontuadas p
        where p.prioridade>0 and p.prioridade=(select max(q.prioridade) from pontuadas q);
        if cardinality(candidatos)<>1 then
          raise exception using errcode='P0001',
            message=format('A SR %s possui %s linhas na base e não foi possível identificar uma única correspondência.',numero,quantidade),
            hint='Use Baixar modelo semanal e preserve a coluna ID linha SR. Nenhuma linha foi excluída ou alterada.';
        end if;
        select * into r from public.sr_planilha_registros where id=candidatos[1];
        conciliadas:=conciliadas+1;
      else
        select * into r from public.sr_planilha_registros where origem_revisao=p_revisao and regexp_replace(upper(btrim(numero_sr)),'\s+','','g')=numero;
      end if;
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
        valor_final := case when novo then entrada->'valores'->i else
          sr_planilha_interno.acrescentar_valor_importado(r.valores->i,entrada->'valores'->i,baseline->i) end;
        if novo or sr_planilha_interno.normalizar_celula(valor_final)<>sr_planilha_interno.normalizar_celula(r.valores->i) then
          alteracoes:=alteracoes||jsonb_build_array(jsonb_build_object('coluna',i,'anterior',r.valores->i,
            'recebido',entrada->'valores'->i,'novo',valor_final)); total:=total+1;
        end if;
      end if;
    end loop;
    if novo then novos:=novos+1;end if;
    lista:=lista||jsonb_build_array(jsonb_build_object('id',registro_id,'linha_origem',r.linha_origem,'novo',novo,'numero_sr',numero,'valores',jsonb_set(entrada->'valores',array['2'],to_jsonb(numero)),
      'baseline',baseline,'esperadas',esperadas,'alvos',alvos,'alteracoes',alteracoes,'aging_formula',coalesce((entrada->>'aging_formula')::boolean,false)));
  end loop;
  return jsonb_build_object('modo','acrescentar_v17','identificacao','linhas_v18','conciliadas',conciliadas,'revisao',p_revisao,'ano',p_ano,'linhas',lista,'ignoradas',ignoradas,'novas',novos,'celulas',total);
end;
$prever$;

-- Mantém a autorização explícita de Administrador/Gestor no esquema privado.
revoke execute on function sr_planilha_interno.prever_carga(text,integer,jsonb) from public,anon;
grant execute on function sr_planilha_interno.prever_carga(text,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
select 'V18 instalada: linhas repetidas identificadas pelos dados de origem, sem excluir registros ou históricos.' as resultado;
