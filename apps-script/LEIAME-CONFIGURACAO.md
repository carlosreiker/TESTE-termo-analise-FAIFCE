# Rascunho completo no Gmail (mensagem + assinatura) — configuração única

Faça **uma vez**, com uma conta Google da FAIFCE (leva cerca de 10 minutos). Depois, todos da equipe usam o botão do site e cada um recebe o rascunho no **seu** Gmail, com a **sua** assinatura padrão.

1. Acesse https://script.google.com › **Novo projeto**. Dê o nome "Termo de Análise FAIFCE - rascunhos".
2. Apague o conteúdo do arquivo `Código.gs` e cole todo o conteúdo de `Code.gs` (desta pasta).
3. Menu **Configurações do projeto** (engrenagem) › marque **Mostrar arquivo de manifesto "appsscript.json" no editor**. Volte ao editor, abra `appsscript.json` e cole o conteúdo de `appsscript.json` desta pasta.
4. Em **Serviços** (+, na lateral esquerda), adicione **Gmail API** (versão v1). Se o manifesto já listou o serviço, confirme que aparece como "Gmail".
5. Clique em **Implantar › Nova implantação › Tipo: App da Web**:
   - **Executar como:** Usuário que acessa o app
   - **Quem pode acessar:** qualquer pessoa na organização (FAIFCE). Se as contas não forem de um domínio Google Workspace, use "Qualquer pessoa com Conta do Google".
   - Autorize quando o Google pedir (só você, nesta etapa).
6. Copie a **URL do app da Web** (termina em `/exec`).
7. No site, abra `assets/js/termo-analise-faifce.js` e cole a URL na constante `GMAIL_DRAFT_ENDPOINT` (no começo do bloco "E-MAIL"). Salve e publique o site de novo.
8. Cada pessoa da equipe, na **primeira vez** que usar o botão, verá a tela de autorização do Google (permitir criar rascunhos e ler a assinatura). É só aceitar.

Observações
- O script só cria o rascunho (não envia nada) e só lê a assinatura padrão da própria conta de quem clica.
- Quem usa várias contas Google no mesmo navegador deve estar com a conta da FAIFCE como principal; se o rascunho cair na conta errada, abra o site em uma janela com apenas a conta da FAIFCE logada.
- O PDF e a pasta do Drive continuam sendo anexados à mão no Gmail.
- Para alterar o script depois: edite o código e use **Implantar › Gerenciar implantações › Editar › Nova versão** (a URL continua a mesma).
