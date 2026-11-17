# termo-analise-FAIFCE

Site para preenchimento interativo do documento "Termo de Análise Inicial" dos pedidos de compra/serviços enviados ao setor de Projetos da FAIFCE. Funciona 100% no navegador, sem servidor: os dados ficam na máquina de quem usa.

## Estrutura

```
index.html                         página única do sistema
assets/
  css/termo-analise-faifce.css     estilos (tela e impressão)
  js/termo-analise-faifce.js       lógica do formulário, valor estimado e rascunhos
  js/leitor-itens-imagem.js        leitor de prints (OCR) que preenche a tabela de itens
  img/logo-oficial.png             logo do cabeçalho do documento
  img/logo-marca-dagua.png         marca d'água
LICENSE
.gitignore
```

## Como usar

1. Abra `index.html` em um navegador.
2. Preencha os campos do pedido, projeto, itens, subitens e parecer. Em cada rubrica e subitem há o campo opcional **Meta/Etapa**, que só aparece no documento quando preenchido.
3. **Valor estimado**: é a soma de `Quantidade × Valor Unitário` de cada item, atualizada ao vivo. Pode ser editado à mão; nesse caso o campo mostra a soma dos itens e o botão "Voltar ao automático".
4. **Datas**: os campos de data aceitam digitação (a barra é colocada sozinha, formato dd/mm/aaaa) e também o calendário, pelo botão 📅 ao lado. Datas incompletas ou inexistentes (ex.: 31/02) deixam o campo inválido. A data da análise (ao lado do responsável) vem preenchida com o dia de hoje e pode ser alterada.
5. **Gerar PDF** abre a impressão do navegador com o termo em A4 (margem de 10 mm em cima/embaixo e 12 mm nas laterais). O PDF carrega, em texto invisível, os dados do preenchimento (veja "Rascunhos").
6. **Enviar e-mail**: abre um rascunho no Gmail com o modelo e os dados do pedido (veja abaixo).
7. **Resetar** limpa todos os dados.

## Importar itens por imagem (prints)

Em **Itens da Solicitação**, o botão **Importar itens por imagem** abre o leitor:

- **Anexar imagens** (várias de uma vez), **Colar imagem** / `Ctrl+V` (também funciona com a página em foco) ou arrastar os arquivos. Dá para continuar adicionando prints enquanto os anteriores são lidos; cada print pode ser removido individualmente.
- O leitor procura o cabeçalho da tabela, aproveita só **Produto, Quantidade, Unidade e Valor Unitário Sugerido** e ignora o resto (Código, Descrição, Valor Total, Moeda, Situação...). Funciona com tema claro ou escuro, com ou sem linhas de grade, com produtos que quebram em duas linhas e com colunas em ordens diferentes. Sem cabeçalho visível, as colunas são deduzidas pelo conteúdo (aviso exibido).
- Tudo é **editável antes de inserir**. Linhas **vermelhas** têm campo vazio/inválido; **amarelas** pedem conferência (leitura incerta, unidade desconhecida, item repetido, `Qtd × Valor` diferente do Valor Total do print, `175g` lido como `1759` etc.). Há filtro "só linhas com aviso" e botão para remover repetidos.
- Ao inserir, se a tabela já tiver itens, o sistema pergunta se deve **acrescentar abaixo** ou **substituir todos**. Os itens com pendência continuam marcados na tabela do formulário até serem corrigidos.
- Depois de preenchidos, cada item tem as setas **▲ ▼** para mudar a ordem.

O reconhecimento roda no navegador (Tesseract.js): as imagens não são enviadas a nenhum servidor. Na **primeira** leitura é preciso internet para baixar o motor e o idioma português (depois ficam em cache). Um print com ~35 linhas leva de 15 a 40 segundos. Acentos e caracteres parecidos (`g`/`9`) podem exigir conferência: use sempre a revisão antes de inserir.

## Rascunhos (trabalho em equipe)

- **Salvar rascunho** (ou `Ctrl+S`) baixa um arquivo `Termo_<número>_2026.faifce.json` com todo o preenchimento.
- **Abrir rascunho** aceita o arquivo `.faifce.json` **ou um Termo de Análise em PDF gerado por este site** (o PDF traz os dados embutidos; PDFs gerados antes desta versão ou por outros programas não podem ser abertos). A leitura do PDF precisa de internet na primeira vez (baixa o pdf.js).
  Carrega o conteúdo de volta no formulário. Se houver alterações não salvas, o site pede confirmação antes de substituir.
- O aviso ao fechar a aba só aparece quando há alterações desde o último salvamento ou abertura.

Sugestão de rotina para a equipe:

- Guardar os rascunhos em uma pasta compartilhada (Google Drive, OneDrive ou SharePoint).
- Ao editar um termo, salvar com o sufixo de versão no nome: `Termo_5484_2026_v2.faifce.json`, para que duas pessoas não sobrescrevam o trabalho uma da outra.
- Não enviar rascunhos ao repositório: contêm dados financeiros dos projetos (`*.faifce.json` está no `.gitignore`).

### Formato do arquivo

JSON legível, com `formato: "faifce-termo-analise"` e `versao: 2`. Ao abrir, o site valida o arquivo e descarta o que não reconhece. No campo Parecer só são mantidos negrito, itálico, sublinhado e quebras de linha. Mudanças futuras no formato aumentam o número de `versao`; rascunhos antigos continuam abrindo.

## Enviar e-mail (Gmail)

O botão **Enviar e-mail** só fica habilitado quando todos os campos obrigatórios estão preenchidos. A janela traz o campo **Pedido Prioritário?**: se marcado, o assunto começa com "PRIORITÁRIO - " e a primeira linha do e-mail é "PEDIDO PRIORITÁRIO" (texto preto, negrito, fundo vermelho vivo).

### Modo automático (recomendado): mensagem + assinatura juntas

Exige a configuração única da pasta `apps-script/` (veja `apps-script/LEIAME-CONFIGURACAO.md`; cerca de 10 minutos, feita por uma pessoa da FAIFCE). Depois, o botão **Criar rascunho no Gmail** abre uma aba que cria, no Gmail de quem clicou, um rascunho com assunto, mensagem formatada (negrito real e destaque) e a **assinatura padrão dessa pessoa**. Falta só inserir a pasta do Drive, anexar o PDF e informar os destinatários.

### Modo sem configuração (copiar e colar)

Enquanto `GMAIL_DRAFT_ENDPOINT` (em `assets/js/termo-analise-faifce.js`) estiver vazio, o botão **Abrir Gmail** abre o Gmail só com o assunto (o Gmail insere a assinatura) e deixa a mensagem copiada: clique no corpo e cole com **Ctrl+V**. A alternativa por link abre o rascunho preenchido, mas sem assinatura e sem o destaque vermelho (limites do Gmail em rascunhos abertos por link).

### Pasta do Drive e PDF (manuais)

Ícone do Google Drive › pesquise **1. ATIVOS** › pasta do projeto › **01 | Instrumentos Jurídicos** › **Adicionar como link**; apague a linha de instrução entre colchetes. O PDF (gerado antes com **Gerar PDF**) é anexado pelo clipe ou arrastando o arquivo.

## Publicação

Veja `DEPLOY.md` (Vercel: produção na branch `main` e teste na branch `teste`).

## Objetivo

Automatizar a criação do Termo de Análise Inicial para a FAIFCE, garantindo que os dados de solicitação, projeto e parecer sejam organizados e apresentados em um documento pronto para impressão.
