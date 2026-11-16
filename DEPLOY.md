# Publicação na Vercel — teste e produção

Site estático: não há build. Framework Preset = **Other**, Build Command e Output Directory em branco (raiz do repositório).

## Modelo recomendado: 1 projeto, 2 branches
| Ambiente | Branch Git | URL |
|---|---|---|
| Produção (definitivo) | `main` | `termo-analise-faifce.vercel.app` (ou domínio próprio) |
| Teste | `teste` | URL fixa da branch (ver passo 5) |

1. Crie o repositório no GitHub com estes arquivos (o `.gitignore` já exclui `*.faifce.json`). Branch `main` = produção.
2. Crie a branch de testes: `git checkout -b teste && git push -u origin teste`.
3. Em vercel.com → **Add New → Project** → importe o repositório. Production Branch = `main`. Deploy.
4. Todo push na `main` atualiza a produção; todo push na `teste` gera um deploy de **Preview**.
5. URL fixa de teste: Project → **Settings → Domains → Add** → informe, por exemplo, `termo-analise-faifce-teste.vercel.app` e, em *Git Branch*, escolha `teste`.
6. Fluxo de trabalho: altere e envie para `teste` → valide (PDF, calendário, e-mail, leitor de imagens) → faça merge `teste` → `main` para publicar.

## Alternativa: 2 projetos separados
Importe o mesmo repositório duas vezes (`...-teste` apontando para a branch `teste`, e `...` para a `main`). Mais simples de entender, mas gera dois projetos para manter.

## Observações
- **Proteção dos previews:** em Settings → Deployment Protection, mantenha a proteção ligada para que o ambiente de teste exija login Vercel.
- **Acesso à produção:** a URL de produção é pública. Os dados preenchidos nunca vão para a Vercel (ficam no navegador); se quiserem restringir quem abre o site, é preciso plano com proteção por senha ou um domínio atrás de login.
- `vercel.json` inclui `noindex` (o site não aparece em buscadores). Remova o cabeçalho `X-Robots-Tag` se quiserem o contrário.
- Pelo terminal (alternativa): `npm i -g vercel`, `vercel` (preview) e `vercel --prod` (produção).
- O leitor de imagens baixa o Tesseract do CDN jsdelivr na 1ª leitura; não bloquear esse domínio em rede/firewall.
