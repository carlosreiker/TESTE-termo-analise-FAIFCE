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
2. Preencha os campos do pedido, projeto, itens, subitens e parecer.
3. **Valor estimado**: é a soma de `Quantidade × Valor Unitário` de cada item, atualizada ao vivo. Pode ser editado à mão; nesse caso o campo mostra a soma dos itens e o botão "Voltar ao automático".
4. **Gerar PDF** abre a impressão do navegador com o termo em A4.
5. **Resetar** limpa todos os dados.

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
- **Abrir rascunho** carrega um arquivo desse tipo de volta no formulário. Se houver alterações não salvas, o site pede confirmação antes de substituir.
- O aviso ao fechar a aba só aparece quando há alterações desde o último salvamento ou abertura.

Sugestão de rotina para a equipe:

- Guardar os rascunhos em uma pasta compartilhada (Google Drive, OneDrive ou SharePoint).
- Ao editar um termo, salvar com o sufixo de versão no nome: `Termo_5484_2026_v2.faifce.json`, para que duas pessoas não sobrescrevam o trabalho uma da outra.
- Não enviar rascunhos ao repositório: contêm dados financeiros dos projetos (`*.faifce.json` está no `.gitignore`).

### Formato do arquivo

JSON legível, com `formato: "faifce-termo-analise"` e `versao: 1`. Ao abrir, o site valida o arquivo e descarta o que não reconhece. No campo Parecer só são mantidos negrito, itálico, sublinhado e quebras de linha. Mudanças futuras no formato aumentam o número de `versao`; rascunhos antigos continuam abrindo.

## Objetivo

Automatizar a criação do Termo de Análise Inicial para a FAIFCE, garantindo que os dados de solicitação, projeto e parecer sejam organizados e apresentados em um documento pronto para impressão.
