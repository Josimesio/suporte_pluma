-- Execute no SQL Editor do projeto Supabase utilizado pelo portal Pluma.
-- Aceita os dois domínios e preserva as demais regras atuais do banco.
-- Não altera usuários, solicitações, perfis ou permissões administrativas.

begin;

do $dominios$
declare
  v_funcao regprocedure;
  v_definicao text;
  v_check text;
  v_predicado_antigo text := 'lower(email) ~~ ''%@plumaagro.com.br''::text';
  v_predicado_novo text := 'lower(btrim(email)) ~ ''^[^[:space:]@]+@(plumaagro[.]com[.]br|ninecon[.]com[.]br)$''::text';
begin
  v_funcao := to_regprocedure('public.situacao_email_portal(text)');
  if v_funcao is null then
    raise exception 'A função situacao_email_portal(text) não foi encontrada. Confira se este é o projeto do portal Pluma.';
  end if;

  select pg_get_functiondef(v_funcao) into v_definicao;

  if position('v_email not like ''%@plumaagro.com.br''' in v_definicao) > 0 then
    v_definicao := replace(
      v_definicao,
      'v_email not like ''%@plumaagro.com.br''',
      'v_email !~ ''^[^[:space:]@]+@(plumaagro[.]com[.]br|ninecon[.]com[.]br)$'''
    );
    execute v_definicao;
  elsif position('v_email !~ ''^[^[:space:]@]+@(plumaagro[.]com[.]br|ninecon[.]com[.]br)$''' in v_definicao) = 0 then
    raise exception 'A validação de situacao_email_portal difere da versão esperada. Nenhuma alteração foi aplicada; confira a definição atual da função.';
  end if;

  select with_check into v_check
  from pg_policies
  where schemaname = 'public'
    and tablename = 'solicitacoes_acesso'
    and policyname = 'Solicitar acesso com email corporativo';

  if v_check is null then
    raise exception 'A política de solicitação de acesso não foi encontrada. Nenhuma alteração foi aplicada.';
  end if;

  if position(v_predicado_antigo in v_check) > 0 then
    v_check := replace(v_check, v_predicado_antigo, v_predicado_novo);
    execute format(
      'alter policy %I on public.solicitacoes_acesso with check (%s)',
      'Solicitar acesso com email corporativo',
      v_check
    );
  elsif position(v_predicado_novo in v_check) = 0 then
    raise exception 'A validação da política difere da versão esperada. Nenhuma alteração foi aplicada; confira a política atual.';
  end if;
end;
$dominios$;

notify pgrst, 'reload schema';

commit;

-- Nas duas primeiras linhas, a situação deve ser diferente de "invalido".
-- Pode retornar "cadastrado" ou "pendente" se o e-mail de teste já existir.
-- Na terceira e na quarta linha, deve retornar "invalido".
select email, public.situacao_email_portal(email) as situacao
from (values
  ('teste.dominio.pluma@plumaagro.com.br'),
  ('teste.dominio.ninecon@ninecon.com.br'),
  ('teste.dominio@exemplo.com.br'),
  ('teste.dominio@ninecon.com.br.exemplo.com')
) as testes(email);
