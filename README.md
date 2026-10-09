# SUPORTE ORACLE — Versões por coluna × linha e carga semanal (V13)

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
atribui nome/e-mail e data; registra a versão 1, os campos preenchidos e um log no
Analítico na mesma transação. As edições seguintes usam o histórico e a conferência
de versão existentes. Cadastros simultâneos preservam o registro salvo e mantêm o
rascunho sem confirmação para revisão.

Os novos registros permanecem disponíveis depois de recarregar, na aba SR e no
Consolidado. Descartar remove somente as edições ainda não salvas. Os dados da
lista e os registros existentes são preservados.

Em **Usuários cadastrados → Configurar → Permissões do usuário**, o Administrador
escolhe se cada usuário visualiza **Planilha**, **SR** e **Consolidado**.
Somente Administrador e Gestor autorizados podem editar e salvar.

Em **ADMIN → Analítico**, os logs mostram usuários, abas, ações, horários,
exportações, salvamentos e alterações de visualização. Salvamentos e configurações
são registrados pelo banco na mesma transação dos dados.

Os dados, versões, painel no cabeçalho e Excel com **CHAMADOS ORACLE** e logo da
Pluma são preservados. Na primeira atualização, usuários existentes mantêm as
visualizações anteriores; depois o Administrador escolhe quais bloquear.

Consulte `CONFIGURAR_SUPABASE_SR.txt` e `TESTAR_CADASTRO_SR_V11.txt`.
Testado localmente; o SQL ainda precisa ser executado no projeto real.
