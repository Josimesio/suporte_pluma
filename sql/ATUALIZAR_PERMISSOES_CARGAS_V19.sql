-- V19 — Delegação de cargas sem acesso administrativo.
-- Execute TODO este arquivo em uma consulta nova do SQL Editor do portal.
-- Requer V10 e a instalação GTN existentes. Não reaplique instalações antigas depois.
-- Mantém os dados, históricos por célula e as permissões atuais; ninguém é liberado automaticamente.
begin;

do $requisitos$
begin
  if to_regprocedure('sr_planilha_interno.administrador_abas()') is null
     or to_regprocedure('gtn_interno.pode_importar()') is null
     or to_regclass('public.chamados_oracle') is null then
    raise exception 'Instale primeiro V10 e Ocorrências GTN no projeto correto do portal.';
  end if;
end;
$requisitos$;

create or replace function sr_planilha_interno.pode_realizar_carga(p_tipo text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_tipo in ('oracle','gtn') and exists (
    select 1 from public.perfis_usuarios p where p.id = auth.uid() and p.ativo is true
      and (p.perfil = 'administrador' or p.permissoes -> ('carga_' || p_tipo) = 'true'::jsonb)
      and (coalesce(p.mfa_obrigatorio,false) is false or coalesce(auth.jwt()->>'aal','') = 'aal2')
  );
$$;

-- Toda alteração destas duas autorizações exige administrador, mesmo fora da interface.
create or replace function sr_planilha_interno.validar_permissoes_cargas()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare chave text; anterior jsonb;
begin
  foreach chave in array array['carga_oracle','carga_gtn'] loop
    if new.permissoes ? chave and jsonb_typeof(new.permissoes->chave) <> 'boolean' then
      raise exception 'A permissão % deve ser booleana.', chave;
    end if;
    anterior := case when tg_op = 'UPDATE' then old.permissoes->chave else null end;
    if anterior is distinct from new.permissoes->chave and auth.uid() is not null
       and not sr_planilha_interno.administrador_abas() then
      raise exception using errcode='42501', message='Somente Administrador ativo pode alterar permissões de carga.';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists portal_validar_permissoes_cargas on public.perfis_usuarios;
create trigger portal_validar_permissoes_cargas before insert or update of permissoes on public.perfis_usuarios
for each row execute function sr_planilha_interno.validar_permissoes_cargas();

-- Altera apenas a autorização da importação GTN já instalada, preservando seu corpo.
create or replace function gtn_interno.pode_importar()
returns boolean language sql stable security invoker set search_path = '' as $$
  select sr_planilha_interno.pode_realizar_carga('gtn');
$$;
-- Leitura operacional necessária para conferir "Gerado em" após a importação.
drop policy if exists gtn_consulta_carga_autorizada on public.gtn_ocorrencias;
create policy gtn_consulta_carga_autorizada on public.gtn_ocorrencias for select to authenticated
using ((select sr_planilha_interno.pode_realizar_carga('gtn')));
-- Os históricos administrativos continuam restritos ao administrador.
drop policy if exists gtn_consulta_versoes_admin on public.gtn_ocorrencias_versoes;
create policy gtn_consulta_versoes_admin on public.gtn_ocorrencias_versoes for select to authenticated
using ((select sr_planilha_interno.administrador_abas()));
drop policy if exists gtn_consulta_importacoes_admin on public.gtn_importacoes;
create policy gtn_consulta_importacoes_admin on public.gtn_importacoes for select to authenticated
using ((select sr_planilha_interno.administrador_abas()));

-- A carga Oracle passa por uma operação específica. Nenhuma política de edição é ampliada.
-- O schema interno e o search_path fechado isolam a operação privilegiada.
create or replace function sr_planilha_interno.importar_oracle(p_ano integer, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; r public.chamados_oracle; quantidade integer := 0;
begin
  if auth.uid() is null or not sr_planilha_interno.pode_realizar_carga('oracle') then
    raise exception using errcode='42501', message='Carga Oracle não autorizada para este usuário.';
  end if;
  if p_ano is null or p_ano not in (2025,2026) then raise exception 'Ano inválido.'; end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then raise exception 'Lista de chamados inválida.'; end if;
  if jsonb_array_length(p_linhas) not between 1 and 300 then raise exception 'Informe entre 1 e 300 chamados por lote.'; end if;
  if exists(select 1 from jsonb_array_elements(p_linhas) x where jsonb_typeof(x.value) <> 'object'
    or nullif(btrim(x.value->>'numero_sr'),'') is null or length(x.value->>'numero_sr') > 100) then
    raise exception 'Há chamado sem número SR válido.';
  end if;
  if (select count(distinct btrim(value->>'numero_sr')) from jsonb_array_elements(p_linhas)) <> jsonb_array_length(p_linhas) then
    raise exception 'Números SR repetidos no lote.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(684214);
  for item in select value from jsonb_array_elements(p_linhas) loop
    -- Autoria e data são determinadas no servidor, nunca aceitas do navegador.
    select * into r from jsonb_populate_record(null::public.chamados_oracle, item || jsonb_build_object(
      'ano',p_ano,'numero_sr',btrim(item->>'numero_sr'),'importado_por',auth.uid(),'importado_em',clock_timestamp()));
    insert into public.chamados_oracle (
      ano,numero_sr,resumo,issue_type,servico,status,severidade,criado_texto,atualizado_texto,fechado_texto,
      contato_primario,grupo_usuario,tenancy,impacto_negocio,conta,referencia_cliente,criado_por,atualizado_por,
      url_recurso,gerado_em_texto,dados_originais,importado_em,importado_por
    ) values (
      r.ano,r.numero_sr,r.resumo,r.issue_type,r.servico,r.status,r.severidade,r.criado_texto,r.atualizado_texto,r.fechado_texto,
      r.contato_primario,r.grupo_usuario,r.tenancy,r.impacto_negocio,r.conta,r.referencia_cliente,r.criado_por,r.atualizado_por,
      r.url_recurso,r.gerado_em_texto,r.dados_originais,r.importado_em,r.importado_por
    ) on conflict (ano,numero_sr) do update set
      resumo=excluded.resumo,issue_type=excluded.issue_type,servico=excluded.servico,status=excluded.status,
      severidade=excluded.severidade,criado_texto=excluded.criado_texto,atualizado_texto=excluded.atualizado_texto,
      fechado_texto=excluded.fechado_texto,contato_primario=excluded.contato_primario,grupo_usuario=excluded.grupo_usuario,
      tenancy=excluded.tenancy,impacto_negocio=excluded.impacto_negocio,conta=excluded.conta,
      referencia_cliente=excluded.referencia_cliente,criado_por=excluded.criado_por,atualizado_por=excluded.atualizado_por,
      url_recurso=excluded.url_recurso,gerado_em_texto=excluded.gerado_em_texto,dados_originais=excluded.dados_originais,
      importado_em=excluded.importado_em,importado_por=excluded.importado_por;
    quantidade := quantidade + 1;
  end loop;
  return quantidade;
end;
$$;
create or replace function public.portal_importar_oracle(p_ano integer,p_linhas jsonb)
returns integer language sql security invoker set search_path = '' as $$
  select sr_planilha_interno.importar_oracle(p_ano,p_linhas);
$$;

revoke all on function sr_planilha_interno.pode_realizar_carga(text),
  sr_planilha_interno.validar_permissoes_cargas(),sr_planilha_interno.importar_oracle(integer,jsonb),
  public.portal_importar_oracle(integer,jsonb),gtn_interno.pode_importar() from public,anon,authenticated;
grant usage on schema sr_planilha_interno,gtn_interno to authenticated;
grant execute on function sr_planilha_interno.pode_realizar_carga(text),
  sr_planilha_interno.importar_oracle(integer,jsonb),public.portal_importar_oracle(integer,jsonb),
  gtn_interno.pode_importar() to authenticated;
notify pgrst,'reload schema';
commit;
select 'V19 instalada. Libere carga_oracle e/ou carga_gtn em Acessos > Usuários cadastrados > Configurar.' as resultado;
