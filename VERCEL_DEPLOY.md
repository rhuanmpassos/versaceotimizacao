# 🚀 Guia Completo de Deploy na Vercel - Versace Otimização

Este guia mostra passo a passo como fazer o deploy do projeto no plano **gratuito** da Vercel.

## ⚡ Resumo Rápido

1. **Backend (Next.js)**: Deploy como projeto separado com root directory `backend`
2. **Frontend (Vue/Vite)**: Deploy como projeto separado com root directory `frontend`
3. **Variáveis de Ambiente**: Configurar `DATABASE_URL`, `CORS_ALLOWED_ORIGIN`, `VITE_API_BASE_URL`, etc.
4. **Migrações**: Executar `npx prisma migrate deploy` após o primeiro deploy do backend
5. **Arquivos de Configuração**: `vercel.json` já estão criados em `backend/` e `frontend/`

> 💡 **Dica**: Leia o guia completo abaixo para instruções detalhadas passo a passo.

## 📋 Pré-requisitos

- Conta no [Vercel](https://vercel.com) (pode criar com GitHub/GitLab/Bitbucket)
- Repositório Git (GitHub, GitLab ou Bitbucket) com o código do projeto
- Banco PostgreSQL já configurado (Render, Railway, Supabase, etc.)
- Node.js instalado localmente (para testes e migrações)

---

## 🔧 Passo 1: Preparar o Repositório

1. Certifique-se de que todo o código está commitado e pushado para o Git:
   ```bash
   git add .
   git commit -m "Preparando para deploy na Vercel"
   git push origin main
   ```

> **Nota**: O projeto já inclui arquivos `vercel.json` configurados em `backend/` e `frontend/` que facilitam o deploy. Esses arquivos já estão configurados com:
> - **Backend**: Build command, install command, e configurações de função serverless
> - **Frontend**: Build command, output directory, e rewrites para SPA (Single Page Application)

---

## 🎯 Passo 2: Deploy do Backend (Next.js API)

### 2.1. Criar Projeto no Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login
2. Clique em **"Add New..."** → **"Project"**
3. Conecte seu repositório Git (GitHub/GitLab/Bitbucket)
4. Selecione o repositório do projeto

### 2.2. Configurar o Backend

1. Na tela de configuração do projeto:
   - **Framework Preset**: Selecione **"Other"** (o arquivo `vercel.json` já está configurado)
   - **Root Directory**: Digite `backend`
   - **Build Command**: Deixe vazio (já configurado no `vercel.json` como `npm run build`)
   - **Output Directory**: Deixe vazio (Next.js usa `.next` automaticamente)
   - **Install Command**: Deixe vazio (já configurado como `npm install`)

2. Clique em **"Environment Variables"** e adicione as seguintes variáveis:

   **Variáveis Obrigatórias:**
   ```
   DATABASE_URL=postgresql://usuario:senha@host:porta/database?sslmode=require
   NODE_ENV=production
   ```
   
   **Variáveis para CORS (Importante para produção):**
   ```
   CORS_ALLOWED_ORIGIN=https://seu-projeto-frontend.vercel.app
   NEXT_PUBLIC_SITE_URL=https://seu-projeto-frontend.vercel.app
   REFERRAL_BASE_URL=https://seu-projeto-frontend.vercel.app
   ```
   
   **Variáveis para Discord (Notificações - Opcional):**
   ```
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   DISCORD_BOT_TOKEN=seu_bot_token_aqui
   DISCORD_USER_ID=seu_user_id_aqui
   ```
   
   > **Importante**: 
   > - Substitua `postgresql://usuario:senha@host:porta/database?sslmode=require` pela URL real do seu banco
   > - Substitua `seu-projeto-frontend.vercel.app` pela URL do frontend (você vai criar depois)
   > - Se tiver múltiplas origens permitidas, separe por vírgula: `https://site1.com,https://site2.com`
   > - O `REFERRAL_BASE_URL` é usado para gerar links de referral corretos
   > - O `DISCORD_WEBHOOK_URL` é usado para enviar notificações no canal quando um novo lead é criado
   > - O `DISCORD_BOT_TOKEN` e `DISCORD_USER_ID` são usados para enviar notificações no PV (mensagem direta)
   > - Todas as variáveis do Discord são opcionais, mas recomendadas para receber notificações

3. Clique em **"Deploy"**

### 2.3. Aguardar Build

- O Vercel vai:
  1. Instalar dependências (`npm install`)
  2. Executar `postinstall` que gera o Prisma Client (`prisma generate`)
  3. Fazer o build do Next.js (`npm run build`)
- Aguarde o build completar (pode levar 2-5 minutos na primeira vez)
- Anote a URL gerada: `https://seu-projeto-backend.vercel.app`

### 2.4. Aplicar Migrações do Prisma

Após o deploy, você precisa aplicar as migrações do banco de dados:

**Opção A - Via Terminal Local (Recomendado):**
```bash
# Navegar para a pasta do backend
cd backend

# Configurar a variável de ambiente temporariamente
# Windows PowerShell:
$env:DATABASE_URL="sua_url_do_postgresql_aqui"

# Windows CMD:
set DATABASE_URL=sua_url_do_postgresql_aqui

# Linux/Mac:
export DATABASE_URL="sua_url_do_postgresql_aqui"

# Executar migrações
npx prisma migrate deploy
```

**Opção B - Via Vercel CLI:**
```bash
# Instalar Vercel CLI globalmente
npm install -g vercel

# Fazer login
vercel login

# Navegar para a pasta do backend
cd backend

# Linkar o projeto (se ainda não linkou)
vercel link

# Executar migrações usando as variáveis de ambiente do Vercel
vercel env pull .env.local
npx prisma migrate deploy
```

**Opção C - Via Script de Deploy (Avançado):**
Você pode criar um script que executa as migrações automaticamente após o deploy usando Vercel Build Hooks ou GitHub Actions.

---

## 🎨 Passo 3: Deploy do Frontend (Vue/Vite)

### 3.1. Criar Novo Projeto no Vercel

1. No dashboard da Vercel, clique em **"Add New..."** → **"Project"**
2. Selecione o **mesmo repositório** do backend
3. Na configuração:
   - **Framework Preset**: Selecione **"Vite"** (o arquivo `vercel.json` já está configurado)
   - **Root Directory**: Digite `frontend`
   - **Build Command**: Deixe vazio (já configurado no `vercel.json` como `npm run build`)
   - **Output Directory**: Deixe vazio (já configurado como `dist`)
   - **Install Command**: Deixe vazio (já configurado como `npm install`)

### 3.2. Configurar Variáveis de Ambiente

1. Clique em **"Environment Variables"**
2. Adicione a variável obrigatória:
   ```
   VITE_API_BASE_URL=https://seu-projeto-backend.vercel.app/api
   ```
   
   > **Importante**: 
   > - Substitua `seu-projeto-backend` pelo nome real do seu projeto backend na Vercel
   > - A URL deve terminar com `/api` (ex: `https://versace-backend.vercel.app/api`)
   > - Use a URL do backend que você anotou no Passo 2.3

3. Clique em **"Deploy"**

### 3.3. Aguardar Build

- O Vercel vai:
  1. Instalar dependências (`npm install`)
  2. Fazer o build do Vite (`npm run build`)
  3. Gerar os arquivos estáticos na pasta `dist`
- Aguarde completar (1-3 minutos)
- Anote a URL gerada: `https://seu-projeto-frontend.vercel.app`

### 3.4. Atualizar CORS no Backend

Após obter a URL do frontend, você precisa atualizar as variáveis de ambiente do backend:

1. Vá no projeto do backend na Vercel
2. Acesse **"Settings"** → **"Environment Variables"**
3. Atualize as variáveis:
   ```
   CORS_ALLOWED_ORIGIN=https://seu-projeto-frontend.vercel.app
   NEXT_PUBLIC_SITE_URL=https://seu-projeto-frontend.vercel.app
   REFERRAL_BASE_URL=https://seu-projeto-frontend.vercel.app
   ```
4. Faça um novo deploy (ou aguarde o redeploy automático)

---

## ✅ Passo 4: Verificar e Testar

### 4.1. Testar Backend

1. Acesse: `https://seu-projeto-backend.vercel.app/api/leads`
2. Deve retornar erro 405 (Method Not Allowed) - isso é **normal**, significa que a rota existe
3. Teste com Postman/Insomnia fazendo um POST para `/api/leads` com:
   ```json
   {
     "nome": "Teste",
     "whatsapp": "11999999999"
   }
   ```

### 4.2. Testar Frontend

1. Acesse a URL do frontend: `https://seu-projeto-frontend.vercel.app`
2. Verifique se a página carrega corretamente
3. Teste o formulário de lead
4. Verifique no console do navegador se não há erros de CORS

### 4.3. Verificar Logs

- No dashboard da Vercel, vá em **"Deployments"** → Selecione o deployment → **"Functions"** → **"View Function Logs"**
- Verifique se não há erros relacionados ao Prisma ou banco de dados

---

## 🔄 Passo 5: Configurar Deploy Automático

### 5.1. Deploy Automático

Por padrão, a Vercel já configura deploy automático quando você faz push para a branch `main` (ou `master`).

Para verificar:
1. Vá em **"Settings"** → **"Git"**
2. Confirme que está conectado ao repositório correto
3. A branch de produção deve estar configurada (geralmente `main`)

### 5.2. Variáveis de Ambiente por Ambiente

Você pode ter variáveis diferentes para produção e preview:

1. Vá em **"Settings"** → **"Environment Variables"**
2. Configure variáveis para:
   - **Production**: Use a URL do backend de produção
   - **Preview**: Pode usar a mesma ou uma diferente
   - **Development**: Para desenvolvimento local

---

## 🐛 Troubleshooting

### Erro: "Prisma Client not generated"

**Solução:**
- Adicione no `package.json` do backend (se ainda não tiver):
  ```json
  "scripts": {
    "postinstall": "prisma generate"
  }
  ```
- Ou adicione no Build Command do Vercel: `npm install && npx prisma generate && npm run build`

### Erro: "Cannot connect to database"

**Solução:**
- Verifique se `DATABASE_URL` está correta no dashboard da Vercel
- Confirme que o banco no Render aceita conexões externas
- Verifique se o SSL está habilitado na URL (deve ter `?sslmode=require`)

### Erro: "CORS policy"

**Solução:**
- Verifique se as variáveis de ambiente estão configuradas corretamente no backend:
  - `CORS_ALLOWED_ORIGIN` deve conter a URL exata do frontend (sem barra no final)
  - `NEXT_PUBLIC_SITE_URL` deve conter a URL do frontend
  - `REFERRAL_BASE_URL` deve conter a URL do frontend
- O backend valida CORS em produção baseado nessas variáveis
- Certifique-se de que a URL do frontend está exatamente como aparece no navegador (com `https://`)
- Se ainda não funcionar, verifique os logs do backend na Vercel para ver qual origem está sendo bloqueada

### Frontend não consegue conectar ao backend

**Solução:**
- Verifique se `VITE_API_BASE_URL` está correto no frontend
- Confirme que a URL do backend termina com `/api` (ex: `https://backend.vercel.app/api`)
- Teste a URL do backend diretamente no navegador

### Build falha no Vercel

**Solução:**
- Verifique os logs de build no dashboard da Vercel
- Confirme que todas as dependências estão em `dependencies` (não `devDependencies`)
- Para o Prisma, ele precisa estar em `dependencies` para produção
- O `package.json` do backend já tem `postinstall` configurado para gerar o Prisma Client automaticamente
- Se o erro for relacionado ao Prisma, verifique se `DATABASE_URL` está configurada (mesmo que não seja usada no build, pode causar problemas)

### Erro: "Referral links não funcionam"

**Solução:**
- Verifique se `REFERRAL_BASE_URL` está configurada no backend com a URL correta do frontend
- O código usa essa variável para gerar os links de referral
- Certifique-se de que a URL não termina com `/`
- Teste gerando um novo link de referral após configurar a variável

---

## 📊 Limites do Plano Gratuito

### O que você tem de graça:
- ✅ **100GB de bandwidth/mês** - Suficiente para começar
- ✅ **Builds ilimitados** - Sem limite de deploys
- ✅ **Deploy automático** - A cada push no Git
- ✅ **SSL gratuito** - HTTPS automático
- ✅ **Edge Network** - CDN global
- ✅ **Funções Serverless** - Para APIs

### O que pode ser limitado:
- ⚠️ **Bandwidth**: Se passar de 100GB/mês, precisa fazer upgrade
- ⚠️ **Timeout**: Funções têm timeout de 10s (Hobby) ou 60s (Pro)
- ⚠️ **Build time**: Builds podem demorar alguns minutos

---

## 🔐 Segurança

### Variáveis de Ambiente

- **NUNCA** commite arquivos `.env` no Git
- Use sempre as variáveis de ambiente do dashboard da Vercel
- Para desenvolvimento local, use `.env.local` (já está no `.gitignore`)
- As variáveis sensíveis como `DATABASE_URL` nunca devem ser expostas no código

### CORS

- O backend já está configurado para validar CORS em produção
- Em produção, apenas as origens listadas em `CORS_ALLOWED_ORIGIN` são permitidas
- O código em `backend/utils/cors.js` valida automaticamente baseado nas variáveis de ambiente
- Certifique-se de configurar `CORS_ALLOWED_ORIGIN` com a URL exata do frontend

### Rate Limiting

- O backend já implementa rate limiting em todas as rotas
- Limites configurados:
  - `/api/leads`: 10 requisições por 15 minutos
  - `/api/referral/create`: 5 requisições por hora
  - `/api/referral/track`: 30 requisições por minuto
- Em produção, considere usar Redis para rate limiting distribuído (atualmente usa memória local)

---

## 📝 Checklist Final

Antes de considerar o deploy completo:

### Backend
- [ ] Backend deployado e funcionando
- [ ] `DATABASE_URL` configurada corretamente
- [ ] `NODE_ENV=production` configurada
- [ ] `CORS_ALLOWED_ORIGIN` configurada com URL do frontend
- [ ] `NEXT_PUBLIC_SITE_URL` configurada com URL do frontend
- [ ] `REFERRAL_BASE_URL` configurada com URL do frontend
- [ ] Migrações do Prisma aplicadas no banco (`npx prisma migrate deploy`)
- [ ] Teste de API funcionando (POST `/api/leads`)

### Frontend
- [ ] Frontend deployado e funcionando
- [ ] `VITE_API_BASE_URL` configurada com URL do backend + `/api`
- [ ] Página carrega sem erros no console
- [ ] Formulário de lead testado e salvando no banco
- [ ] Formulário de referral testado e gerando links
- [ ] Tracking de referral funcionando
- [ ] Links de referral redirecionam corretamente

### Geral
- [ ] URLs finais anotadas e funcionando
- [ ] Sem erros de CORS no console do navegador
- [ ] Logs da Vercel sem erros críticos
- [ ] Testado em diferentes navegadores

---

## 🎉 Pronto!

Seu projeto está no ar! 

**URLs finais:**
- Frontend: `https://seu-projeto-frontend.vercel.app`
- Backend: `https://seu-projeto-backend.vercel.app`

**Próximos passos:**
- Configure um domínio customizado (opcional, no plano gratuito)
- Monitore os logs e métricas no dashboard da Vercel
- Configure alertas se necessário

---

## 📁 Estrutura dos Arquivos de Configuração

### `backend/vercel.json`
Este arquivo configura o deploy do backend Next.js:
- Configura a região para `gru1` (São Paulo, Brasil) - opcional, mas melhora latência
- Define timeout de 10 segundos para funções serverless (limite do plano Hobby)
- A Vercel detecta automaticamente Next.js e configura build/install commands
- O Prisma Client é gerado automaticamente via `postinstall` no `package.json`

### `frontend/vercel.json`
Este arquivo configura o deploy do frontend Vue/Vite:
- Define o output directory como `dist`
- Configura rewrites para SPA (todas as rotas redirecionam para `index.html`)
- Framework detectado automaticamente como Vite

---

## 🔄 Deploy Automático e CI/CD

### Como Funciona

1. **Deploy Automático**: A Vercel detecta automaticamente pushes na branch `main` (ou `master`)
2. **Preview Deploys**: Cada Pull Request gera um preview deployment com URL única
3. **Builds Paralelos**: Backend e frontend podem ser deployados em paralelo

### Configurar Branch de Produção

1. Vá em **"Settings"** → **"Git"**
2. Selecione a branch de produção (geralmente `main`)
3. Configure branches de preview se necessário

### Variáveis de Ambiente por Ambiente

Você pode configurar variáveis diferentes para cada ambiente:

1. Vá em **"Settings"** → **"Environment Variables"**
2. Ao adicionar uma variável, selecione os ambientes:
   - **Production**: Apenas para deploy de produção
   - **Preview**: Para todos os preview deployments (PRs)
   - **Development**: Para desenvolvimento local (via Vercel CLI)

**Exemplo de configuração:**
- `DATABASE_URL`: Production e Preview (mesma URL ou diferentes)
- `VITE_API_BASE_URL`: Production e Preview (URLs diferentes)
- `CORS_ALLOWED_ORIGIN`: Production (URL de produção) e Preview (URL do preview)

---

## 📞 Suporte

- [Documentação Vercel](https://vercel.com/docs)
- [Documentação Next.js](https://nextjs.org/docs)
- [Documentação Prisma](https://www.prisma.io/docs)
- [Documentação Vite](https://vitejs.dev/guide/)

