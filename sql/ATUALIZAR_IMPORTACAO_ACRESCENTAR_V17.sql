-- SUPORTE ORACLE — V17: acrescentar mudanças na mesma célula.
-- Execute TODO este arquivo no SQL Editor do portal após a V16.
-- Mantém o conteúdo atual, autoria, permissões e histórico por coluna × linha.
begin;

do $requisitos$
begin
  if to_regclass('public.consolidado_celulas_versoes') is null
    or to_regprocedure('sr_planilha_interno.aplicar_carga(jsonb,text,text)') is null then
    raise exception 'Instale a importação semanal V13 antes desta atualização.';
  end if;
  if to_regclass('public.logs_abas_portal') is not null then
    raise exception 'Execute primeiro sql/REMOVER_LOGS_ABAS_V16.sql para concluir a remoção dos logs gerais.';
  end if;
end;
$requisitos$;

-- Compartilhada entre a prévia e o salvamento: o resultado exibido é o salvo.
-- Valores vazios não apagam o texto atual. O mesmo trecho final não é repetido.
-- Se o Excel contém o texto anterior seguido das novidades, acrescenta apenas
-- o trecho novo, preservando também as edições feitas no painel.
create or replace function sr_planilha_interno.acrescentar_valor_importado(
  atual jsonb, recebido jsonb, base_anterior jsonb
) returns jsonb language plpgsql immutable security invoker set search_path = '' as $acrescentar$
declare
  atual_texto text := coalesce(atual #>> '{}', '');
  recebido_texto text := coalesce(recebido #>> '{}', '');
  base_texto text := coalesce(base_anterior #>> '{}', '');
  comparavel text;
  complemento text;
  resultado text;
begin
  recebido_texto := replace(replace(recebido_texto, E'\r\n', E'\n'), E'\r', E'\n');
  base_texto := replace(replace(base_texto, E'\r\n', E'\n'), E'\r', E'\n');
  comparavel := replace(replace(atual_texto, E'\r\n', E'\n'), E'\r', E'\n');
  if btrim(recebido_texto, E' \t\r\n') = '' then return coalesce(atual, 'null'::jsonb); end if;
  if btrim(atual_texto, E' \t\r\n') = '' then return recebido; end if;
  if recebido_texto = comparavel then return atual; end if;

  complemento := recebido_texto;
  if left(recebido_texto, length(comparavel) + 1) = comparavel || E'\n' then
    complemento := substring(recebido_texto from length(comparavel) + 2);
  elsif btrim(base_texto, E' \t\r\n') <> ''
    and left(recebido_texto, length(base_texto) + 1) = base_texto || E'\n' then
    complemento := substring(recebido_texto from length(base_texto) + 2);
  end if;
  complemento := btrim(complemento, E'\r\n');
  if btrim(complemento, E' \t\r\n') = ''
    or right(E'\n' || comparavel, length(complemento) + 1) = E'\n' || complemento then
    return atual;
  end if;
  resultado := atual_texto || case when right(atual_texto, 1) = E'\n' then '' else E'\n' end || complemento;
  if length(resultado) > 20000 then
    raise exception 'O conteúdo acumulado da célula ultrapassa 20.000 caracteres. Nenhum texto foi truncado; revise a célula antes de importar.';
  end if;
  return to_jsonb(resultado);
end;
$acrescentar$;

revoke execute on function sr_planilha_interno.acrescentar_valor_importado(jsonb,jsonb,jsonb)
  from public, anon, authenticated;

create or replace function sr_planilha_interno.prever_carga(p_revisao text,p_ano integer,p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path='' as $prever$
declare entrada jsonb; r public.sr_planilha_registros; numero text; quantidade integer; baseline jsonb; esperadas jsonb; alteracoes jsonb; alvos jsonb; i integer; lista jsonb:='[]'; ignoradas integer:=0; novos integer:=0; total integer:=0; usados uuid[]:='{}'; registro_id uuid; novo boolean; valor_final jsonb;
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
        valor_final := case when novo then entrada->'valores'->i else
          sr_planilha_interno.acrescentar_valor_importado(r.valores->i,entrada->'valores'->i,baseline->i) end;
        if novo or sr_planilha_interno.normalizar_celula(valor_final)<>sr_planilha_interno.normalizar_celula(r.valores->i) then
          alteracoes:=alteracoes||jsonb_build_array(jsonb_build_object('coluna',i,'anterior',r.valores->i,
            'recebido',entrada->'valores'->i,'novo',valor_final)); total:=total+1;
        end if;
      end if;
    end loop;
    if novo then novos:=novos+1;end if;
    lista:=lista||jsonb_build_array(jsonb_build_object('id',registro_id,'novo',novo,'numero_sr',numero,'valores',jsonb_set(entrada->'valores',array['2'],to_jsonb(numero)),
      'baseline',baseline,'esperadas',esperadas,'alvos',alvos,'alteracoes',alteracoes,'aging_formula',coalesce((entrada->>'aging_formula')::boolean,false)));
  end loop;
  return jsonb_build_object('modo','acrescentar_v17','revisao',p_revisao,'ano',p_ano,'linhas',lista,'ignoradas',ignoradas,'novas',novos,'celulas',total);
end;
$prever$;

create or replace function sr_planilha_interno.aplicar_carga(p_previa jsonb,p_arquivo text,p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $importar$
declare carga uuid; entrada jsonb; r public.sr_planilha_registros; baseline jsonb; novos_valores jsonb; i integer; ano_ref integer; revisao text; ator public.perfis_usuarios; novas integer:=0; alteradas integer:=0; normal_numero text; valor jsonb;
begin
  if p_previa->>'modo' is distinct from 'acrescentar_v17' then raise exception 'A prévia está desatualizada. Feche e selecione a planilha novamente.'; end if;
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
          valor := sr_planilha_interno.acrescentar_valor_importado(r.valores->i,valor,baseline->i);
          if sr_planilha_interno.normalizar_celula(valor)<>sr_planilha_interno.normalizar_celula(r.valores->i) then novos_valores:=jsonb_set(novos_valores,array[i::text],valor,false);alteradas:=alteradas+1;end if;
        end if;
      end loop;
      if novos_valores<>r.valores then update public.sr_planilha_registros set valores=novos_valores where id=r.id;end if;
    end if;
    insert into sr_planilha_interno.base_importada(registro_id,valores) values(r.id,entrada->'valores') on conflict(registro_id) do update set valores=excluded.valores;
  end loop;
  update public.consolidado_importacoes set linhas_novas=novas,celulas_alteradas=alteradas where id=carga;
  perform set_config('pluma.importacao_id','',true);
  return jsonb_build_object('id',carga,'novas',novas,'celulas',alteradas);
end;
$importar$;

-- Preserva a API existente; as duas funções privilegiadas mantêm a autorização
-- explícita de Administrador/Gestor e a conferência de versões por célula.
revoke execute on function sr_planilha_interno.prever_carga(text,integer,jsonb),
  sr_planilha_interno.aplicar_carga(jsonb,text,text) from public, anon;
grant execute on function sr_planilha_interno.prever_carga(text,integer,jsonb),
  sr_planilha_interno.aplicar_carga(jsonb,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
select 'V17 instalada: mudanças da planilha acrescentadas abaixo do conteúdo atual, na mesma célula.' as resultado;
