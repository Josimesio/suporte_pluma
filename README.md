# SUPORTE ORACLE — Cadastro de SRs sem registro (v11)

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
