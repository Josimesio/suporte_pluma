# SUPORTE ORACLE — Permissões de abas e logs (v10)

Para atualizar a SR já instalada, execute **todo** o arquivo
`sql/ATUALIZAR_ABAS_LOGS_V10.sql` no SQL Editor do Supabase do portal.
Para a primeira instalação da SR, use `sql/INSTALAR_SR_VERSIONADA.sql`.
Depois publique os arquivos deste pacote.

Em **Usuários cadastrados → Configurar → Permissões do usuário**, o Administrador
escolhe se cada usuário visualiza **Planilha**, **SR** e **Consolidado**.
Somente Administrador e Gestor autorizados podem editar e salvar.

Em **ADMIN → Analítico**, os logs mostram usuários, abas, ações, horários,
exportações, salvamentos e alterações de visualização. Salvamentos e configurações
são registrados pelo banco na mesma transação dos dados.

Os dados, versões, painel no cabeçalho e Excel com **CHAMADOS ORACLE** e logo da
Pluma são preservados. Na primeira atualização, usuários existentes mantêm as
visualizações anteriores; depois o Administrador escolhe quais bloquear.

Consulte `CONFIGURAR_SUPABASE_SR.txt` e `TESTAR_ABAS_PAINEL_PLANILHA.txt`.
Testado localmente; o SQL ainda precisa ser executado no projeto real.
