# SUPORTE ORACLE — Posição do botão inferior (V21)

O botão **Salvar consolidado** do rodapé fica à direita, imediatamente antes de **Anterior**, na página inicial e nas páginas de 2025 e 2026.

Publique o pacote e pressione **Ctrl+F5**. A rotina de salvamento é a mesma da V20 e não há novo SQL. Consulte `ATUALIZAR_POSICAO_SALVAR_V21.txt`.

# SUPORTE ORACLE — Salvar também no rodapé (V20)

O botão **Salvar consolidado** também está disponível abaixo da tabela, antes da paginação, na página inicial e nas páginas de 2025 e 2026. Os dois botões usam o mesmo salvamento e compartilham o estado de permissão e alterações pendentes.

Publique o pacote e pressione **Ctrl+F5**. Não há novo SQL para esta alteração. Consulte `ATUALIZAR_BOTAO_SALVAR_V20.txt`.

# SUPORTE ORACLE — Reconhecer exclusão da duplicata (V19)

Após a exclusão da linha 216 da SR `4-0003830879` no banco, publique este pacote e pressione **Ctrl+F5**. Clique em **Recarregar consolidado**.

A V19 remove a linha 216 da base inicial do site e dos scripts de instalação inicial. A linha 214 continua com o mesmo ID e Aging automático. A validação de integridade continua ativa para todas as outras linhas. **Não execute a carga inicial no banco atual.**

Não há SQL novo para a V19. Se a V18 ainda não foi instalada para a importação semanal, execute somente sua atualização, após a V17. Consulte `ATUALIZAR_EXCLUSAO_DUPLICATA_V19.txt`.

# SUPORTE ORACLE — Correção da carga semanal (V18)

Execute `sql/ATUALIZAR_IMPORTACAO_LINHAS_V18.sql` no Supabase após a V17, publique o pacote e pressione **Ctrl+F5**. Depois importe novamente o Excel semanal.

A V18 identifica uma única linha entre SRs repetidas na base usando os dados originais e o tipo de Aging, sem excluir registros nem históricos. Se não houver uma correspondência única, exige o ID fixo do modelo semanal.

As regras de acréscimo de conteúdo e as permissões da V17 permanecem. Consulte `ATUALIZAR_CARGA_SEMANAL_V18.txt`.

# SUPORTE ORACLE — Acrescentar novidades na mesma célula (V17)

A importação semanal mantém o conteúdo atual do site e acrescenta as novidades
abaixo, na mesma célula. A prévia mostra o conteúdo atual, o valor recebido e o
resultado completo antes da confirmação.

Para atualizar a V16, execute **todo** o arquivo
`sql/ATUALIZAR_IMPORTACAO_ACRESCENTAR_V17.sql` no SQL Editor do Supabase do portal,
publique os arquivos deste pacote e pressione **Ctrl+F5**.
Se ainda não aplicou a V16, execute primeiro `sql/REMOVER_LOGS_ABAS_V16.sql`.

Exemplo de conteúdo que já está no site:

```text
Aguardando retorno da Oracle.
```

Após receber uma novidade na planilha, a mesma célula passa a conter:

```text
Aguardando retorno da Oracle.
Correção disponibilizada para teste.
```

Valores vazios não apagam o conteúdo. A mesma planilha repetida não duplica texto
nem cria versões nas células que permanecerem iguais. Se o modelo semanal já
contiver o texto anterior, a importação acrescenta apenas as novidades.
Mudanças sucessivas permanecem na ordem em que forem importadas.

O número da SR continua fixo, e Aging calculado continua automático. Filtros de
Product e Substatus consideram o último valor apresentado na célula. Comentários
PMO e Pluma continuam exclusivos do painel. As versões por coluna × linha
mantêm autor, data, arquivo e origem **Planilha** ou **Painel**. Histórico é visível
somente ao administrador; Administrador/Gestor autorizados mantêm a edição.

Os logs gerais removidos na V16 continuam desativados.
Consulte `ATUALIZAR_ACRESCENTAR_V17.txt` para aplicação e conferência.

## Atualizações anteriores

### Logs das abas removidos (V16)

O bloco de logs foi removido do Analítico e as telas não enviam mais eventos
de Planilha, SR e Consolidado ao banco.

Para concluir a atualização, execute `sql/REMOVER_LOGS_ABAS_V16.sql` no
SQL Editor do Supabase do portal e publique os arquivos deste pacote.
O SQL apaga a tabela de logs e seus índices, inclusive os registros existentes.
Mantenha este SQL como a última atualização caso reaplique versões anteriores.

Históricos de versões, autoria, permissões, importação semanal, exportação Excel,
indicadores de acessos ao portal e solicitações de analítico são mantidos.
Consulte `ATUALIZAR_SEM_LOGS_V16.txt`.

## Versões por coluna × linha e carga semanal (V13)

O Consolidado registra versões independentes por célula, inclusive em
**Comentários PMO** e **Comentários Pluma**. Cada alteração identifica a origem
**Planilha** ou **Painel**, além de autor, data e valores anterior e novo.

Para atualizar a V12, execute todo o arquivo
`sql/ATUALIZAR_CELULAS_IMPORTACAO_V13.sql` no SQL Editor do Supabase do portal,
publique os arquivos deste pacote e atualize a página com Ctrl+F5.
Se ainda não instalou a V12, execute primeiro
`sql/ATUALIZAR_COMENTARIOS_CONSOLIDADO_V12.sql` sobre a instalação V10/V11.

Na aba Consolidado, **Baixar modelo semanal** gera um Excel com IDs fixos de
linha. Depois de editar os campos SR, use **Importar atualização semanal**,
revise a prévia por célula e confirme. Valores que não mudaram na planilha
preservam edições manuais; comentários permanecem no painel. Repetir os mesmos
valores não cria versões novas. A carga considera os chamados da lista do ano.

Consulte **ATUALIZAR_V13.txt** para instalação, arquivos alterados e fluxo completo.
Validado localmente com PostgreSQL e com o Excel real de 245 linhas. O SQL
ainda precisa ser aplicado ao projeto real.

## Cadastro de SRs sem registro (V11)

No Consolidado, as células antes marcadas com traços nos chamados sem registro
na planilha agora permitem preencher os 24 campos da SR. O número da SR identifica
o chamado e permanece fixo.

Para atualizar a V10, execute **todo** o arquivo
`sql/ATUALIZAR_CADASTRO_SR_V11.sql` no SQL Editor do Supabase do portal.
Se ainda usa V8/V9, execute primeiro `sql/ATUALIZAR_ABAS_LOGS_V10.sql`.
Para a primeira instalação da SR, use `sql/INSTALAR_SR_VERSIONADA.sql`.
Depois publique os arquivos deste pacote e atualize o navegador com Ctrl+F5.

O botão **Salvar SR no Supabase** cria apenas as linhas preenchidas. O banco
atribui nome/e-mail e data; registra a versão 1 e os campos preenchidos
na mesma transação. As edições seguintes usam o histórico e a conferência
de versão existentes. Cadastros simultâneos preservam o registro salvo e mantêm o
rascunho sem confirmação para revisão.

Os novos registros permanecem disponíveis depois de recarregar, na aba SR e no
Consolidado. Descartar remove somente as edições ainda não salvas. Os dados da
lista e os registros existentes são preservados.

Em **Usuários cadastrados → Configurar → Permissões do usuário**, o Administrador
escolhe se cada usuário visualiza **Planilha**, **SR** e **Consolidado**.
Somente Administrador e Gestor autorizados podem editar e salvar.

Em **ADMIN → Analítico**, os indicadores de acesso e atendimento continuam
disponíveis. O bloco de logs das abas foi removido na V16.

Os dados, versões, painel no cabeçalho e Excel com **CHAMADOS ORACLE** e logo da
Pluma são preservados. Na primeira atualização, usuários existentes mantêm as
visualizações anteriores; depois o Administrador escolhe quais bloquear.

Consulte `CONFIGURAR_SUPABASE_SR.txt` e `TESTAR_CADASTRO_SR_V11.txt`.
Testado localmente; o SQL ainda precisa ser executado no projeto real.
