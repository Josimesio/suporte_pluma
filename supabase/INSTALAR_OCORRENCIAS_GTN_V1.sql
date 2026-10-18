-- GTN / Programa Conecta — implantação independente da área Oracle.
-- Executar UMA VEZ no SQL Editor do Supabase, antes da primeira importação.
-- Não modifica dados ou tabelas existentes de SR, Consolidado ou Planilha Oracle.
BEGIN;

CREATE SCHEMA IF NOT EXISTS gtn_interno;
GRANT USAGE ON SCHEMA gtn_interno TO authenticated;

CREATE TABLE IF NOT EXISTS public.gtn_ocorrencias (
  codigo text PRIMARY KEY,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  comentarios_pluma text NOT NULL DEFAULT '',
  criticidade text NOT NULL DEFAULT '',
  priorizado text NOT NULL DEFAULT '',
  data_entrega text NOT NULL DEFAULT '',
  versoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  importado_em timestamptz,
  importado_por uuid,
  editado_em timestamptz,
  editado_por uuid,
  CONSTRAINT gtn_codigo_valido CHECK (length(trim(codigo)) BETWEEN 1 AND 64),
  CONSTRAINT gtn_dados_objeto CHECK (jsonb_typeof(dados) = 'object'),
  CONSTRAINT gtn_criticidade_valida CHECK (criticidade IN ('', 'ALTO', 'MÉDIO', 'BAIXO')),
  CONSTRAINT gtn_priorizado_valido CHECK (priorizado IN ('', 'S', 'N'))
);

CREATE TABLE IF NOT EXISTS public.gtn_ocorrencias_versoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo text NOT NULL REFERENCES public.gtn_ocorrencias(codigo) ON DELETE RESTRICT,
  coluna text NOT NULL CHECK (coluna IN ('comentarios_pluma', 'criticidade', 'priorizado', 'data_entrega')),
  versao integer NOT NULL CHECK (versao > 0),
  valor_anterior text NOT NULL DEFAULT '',
  valor_novo text NOT NULL DEFAULT '',
  usuario_id uuid,
  usuario_nome text,
  usuario_email text,
  alterado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  origem text NOT NULL DEFAULT 'manual',
  CONSTRAINT gtn_versao_celula_unica UNIQUE(codigo, coluna, versao)
);
CREATE INDEX IF NOT EXISTS idx_gtn_versoes_consulta
  ON public.gtn_ocorrencias_versoes(codigo, coluna, versao DESC);

CREATE TABLE IF NOT EXISTS public.gtn_importacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  arquivo text NOT NULL,
  total integer NOT NULL,
  novos integer NOT NULL,
  atualizados integer NOT NULL,
  inalterados integer NOT NULL,
  usuario_id uuid,
  importado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- SECURITY DEFINER com search_path fechado: permissões não dependem da camada JavaScript.
CREATE OR REPLACE FUNCTION gtn_interno.pode_visualizar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $f$
 SELECT EXISTS (
  SELECT 1 FROM public.perfis_usuarios p
   WHERE p.id=auth.uid() AND p.ativo IS TRUE AND (
     p.perfil = 'administrador' OR (
       p.permissoes->>'aba_ocorrencias' = 'true' AND
       (p.permissoes->>'inicio' = 'true' OR p.permissoes->>'chamados_2026' = 'true')
     )
   )
 );
$f$;

CREATE OR REPLACE FUNCTION gtn_interno.pode_editar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $f$
 SELECT EXISTS (
  SELECT 1 FROM public.perfis_usuarios p
   WHERE p.id=auth.uid() AND p.ativo IS TRUE AND (
     p.perfil = 'administrador' OR (
       p.perfil = 'gestor' AND p.permissoes->>'aba_ocorrencias' = 'true' AND
       (p.permissoes->>'inicio' = 'true' OR p.permissoes->>'chamados_2026' = 'true')
     )
   )
 );
$f$;

CREATE OR REPLACE FUNCTION gtn_interno.pode_importar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $f$
 SELECT EXISTS (
  SELECT 1 FROM public.perfis_usuarios p
   WHERE p.id=auth.uid() AND p.ativo IS TRUE AND p.perfil = 'administrador'
 );
$f$;

ALTER TABLE public.gtn_ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtn_ocorrencias_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtn_importacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gtn_consulta_ocorrencias ON public.gtn_ocorrencias;
CREATE POLICY gtn_consulta_ocorrencias ON public.gtn_ocorrencias
FOR SELECT TO authenticated USING (gtn_interno.pode_visualizar());
DROP POLICY IF EXISTS gtn_consulta_versoes_admin ON public.gtn_ocorrencias_versoes;
CREATE POLICY gtn_consulta_versoes_admin ON public.gtn_ocorrencias_versoes
FOR SELECT TO authenticated USING (gtn_interno.pode_importar());
DROP POLICY IF EXISTS gtn_consulta_importacoes_admin ON public.gtn_importacoes;
CREATE POLICY gtn_consulta_importacoes_admin ON public.gtn_importacoes
FOR SELECT TO authenticated USING (gtn_interno.pode_importar());

-- A importação é transacional: CSV inválido não altera registros. Os quatro campos
-- amarelos NUNCA são atualizados pelo CSV; seus históricos ficam intactos.
CREATE OR REPLACE FUNCTION public.gtn_importar_ocorrencias(p_linhas jsonb, p_arquivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  item jsonb;
  cod text;
  anterior jsonb;
  novos integer := 0;
  atualizados integer := 0;
  inalterados integer := 0;
  total integer;
BEGIN
  IF NOT gtn_interno.pode_importar() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Somente administrador ativo pode importar ocorrências GTN.';
  END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'O arquivo deve conter uma lista JSON de ocorrências.';
  END IF;
  total := jsonb_array_length(p_linhas);
  IF total < 1 OR total > 20000 THEN RAISE EXCEPTION 'Quantidade inválida de ocorrências (1 até 20000).'; END IF;
  IF nullif(trim(p_arquivo),'') IS NULL OR length(p_arquivo) > 255 THEN RAISE EXCEPTION 'Nome do arquivo inválido.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_linhas) x
             WHERE jsonb_typeof(x.value) <> 'object'
               OR nullif(trim(x.value->>'codigo'),'') IS NULL
               OR length(trim(x.value->>'codigo')) > 64
               OR jsonb_typeof(x.value->'dados') <> 'object') THEN
    RAISE EXCEPTION 'Há uma ocorrência sem Código ou sem dados válidos.';
  END IF;
  IF (SELECT count(DISTINCT trim(x.value->>'codigo')) FROM jsonb_array_elements(p_linhas) x) <> total THEN
    RAISE EXCEPTION 'O arquivo possui Códigos repetidos. Corrija antes da importação.';
  END IF;
  -- Evita importações simultâneas concorrentes; toda carga é uma transação só.
  PERFORM pg_catalog.pg_advisory_xact_lock(684213);
  FOR item IN SELECT value FROM jsonb_array_elements(p_linhas)
  LOOP
    cod := trim(item->>'codigo');
    SELECT dados INTO anterior FROM public.gtn_ocorrencias WHERE codigo=cod FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.gtn_ocorrencias(codigo, dados, importado_em, importado_por)
        VALUES (cod, item->'dados', clock_timestamp(), auth.uid());
      novos := novos + 1;
    ELSIF anterior IS DISTINCT FROM (item->'dados') THEN
      UPDATE public.gtn_ocorrencias
         SET dados=item->'dados',importado_em=clock_timestamp(),importado_por=auth.uid()
       WHERE codigo=cod;
      atualizados := atualizados + 1;
    ELSE
      inalterados := inalterados + 1;
    END IF;
  END LOOP;
  INSERT INTO public.gtn_importacoes(arquivo,total,novos,atualizados,inalterados,usuario_id)
    VALUES(p_arquivo,total,novos,atualizados,inalterados,auth.uid());
  RETURN jsonb_build_object('total',total,'novos',novos,'atualizados',atualizados,'inalterados',inalterados);
END;
$fn$;

-- Versionamento por célula, com bloqueio pessimista da linha e conferência
-- otimista do valor anterior (evita sobrescrever edição feita por outra pessoa).
CREATE OR REPLACE FUNCTION public.gtn_salvar_celulas(
  p_codigo text, p_alteracoes jsonb, p_esperados jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  atual public.gtn_ocorrencias%ROWTYPE;
  chave text;
  anterior text;
  novo text;
  versao_nova integer;
  ator record;
  alterados integer := 0;
BEGIN
  IF NOT gtn_interno.pode_editar() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Somente administrador ou gestor autorizado pode editar ocorrências.';
  END IF;
  IF p_alteracoes IS NULL OR jsonb_typeof(p_alteracoes) <> 'object'
    OR p_esperados IS NULL OR jsonb_typeof(p_esperados) <> 'object' THEN
    RAISE EXCEPTION 'Alterações e valores esperados devem ser objetos.';
  END IF;
  SELECT * INTO atual FROM public.gtn_ocorrencias WHERE codigo=p_codigo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ocorrência % não encontrada.', p_codigo; END IF;
  SELECT nome,email INTO ator FROM public.perfis_usuarios WHERE id=auth.uid();
  FOR chave IN SELECT jsonb_object_keys(p_alteracoes) LOOP
    IF chave NOT IN ('comentarios_pluma','criticidade','priorizado','data_entrega') THEN
      RAISE EXCEPTION 'Coluna não editável: %', chave;
    END IF;
    IF NOT p_esperados ? chave THEN
      RAISE EXCEPTION 'Valor anterior obrigatório para a coluna %.', chave;
    END IF;
    anterior := COALESCE(to_jsonb(atual)->>chave, '');
    novo := COALESCE(p_alteracoes->>chave, '');
    IF COALESCE(p_esperados->>chave,'') IS DISTINCT FROM anterior THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='A célula '||chave||' da ocorrência '||p_codigo||' foi alterada por outro usuário. Recarregue antes de salvar.';
    END IF;
    IF chave='criticidade' THEN
      novo := pg_catalog.upper(pg_catalog.btrim(novo));
      IF novo NOT IN ('','ALTO','MÉDIO','BAIXO') THEN RAISE EXCEPTION 'Criticidade inválida.'; END IF;
    ELSIF chave='priorizado' THEN
      novo := pg_catalog.upper(pg_catalog.btrim(novo));
      IF novo NOT IN ('','S','N') THEN RAISE EXCEPTION 'Priorizado? deve ser S ou N.'; END IF;
    ELSIF chave='data_entrega' THEN
      novo := pg_catalog.btrim(novo);
      IF novo NOT IN ('','-') THEN
        IF novo !~ '^\d{2}/\d{2}/\d{4}$' THEN RAISE EXCEPTION 'Data Entrega deve estar em DD/MM/AAAA.'; END IF;
        BEGIN
          IF pg_catalog.to_char(pg_catalog.to_date(novo,'DD/MM/YYYY'),'DD/MM/YYYY') <> novo THEN
            RAISE EXCEPTION 'Data Entrega inválida.';
          END IF;
        EXCEPTION WHEN datetime_field_overflow THEN
          RAISE EXCEPTION 'Data Entrega inválida.';
        END;
      END IF;
    END IF;
    IF novo IS DISTINCT FROM anterior THEN
      SELECT COALESCE(max(v.versao),0)+1 INTO versao_nova
        FROM public.gtn_ocorrencias_versoes v WHERE v.codigo=p_codigo AND v.coluna=chave;
      UPDATE public.gtn_ocorrencias
        SET comentarios_pluma = CASE WHEN chave='comentarios_pluma' THEN novo ELSE comentarios_pluma END,
            criticidade = CASE WHEN chave='criticidade' THEN novo ELSE criticidade END,
            priorizado = CASE WHEN chave='priorizado' THEN novo ELSE priorizado END,
            data_entrega = CASE WHEN chave='data_entrega' THEN novo ELSE data_entrega END,
            versoes = jsonb_set(versoes, ARRAY[chave], jsonb_build_object('versao',versao_nova,'alterado_em',clock_timestamp()), true),
            editado_em = clock_timestamp(), editado_por=auth.uid()
        WHERE codigo=p_codigo;
      INSERT INTO public.gtn_ocorrencias_versoes
        (codigo,coluna,versao,valor_anterior,valor_novo,usuario_id,usuario_nome,usuario_email)
      VALUES(p_codigo,chave,versao_nova,anterior,novo,auth.uid(),ator.nome,ator.email);
      alterados := alterados + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('codigo',p_codigo,'campos_alterados',alterados);
END;
$fn$;

REVOKE ALL ON public.gtn_ocorrencias,public.gtn_ocorrencias_versoes,public.gtn_importacoes FROM anon,authenticated;
GRANT SELECT ON public.gtn_ocorrencias,public.gtn_ocorrencias_versoes,public.gtn_importacoes TO authenticated;
REVOKE ALL ON FUNCTION public.gtn_importar_ocorrencias(jsonb,text),public.gtn_salvar_celulas(text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gtn_importar_ocorrencias(jsonb,text),public.gtn_salvar_celulas(text,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION gtn_interno.pode_visualizar(),gtn_interno.pode_editar(),gtn_interno.pode_importar() TO authenticated;
COMMIT;
