# 🔐 Guia de Segurança - Versace Otimização

Este documento descreve as medidas de segurança implementadas no projeto.

## 📋 Índice

1. [Proteção de Arquivos Sensíveis](#proteção-de-arquivos-sensíveis)
2. [Validação de Entrada](#validação-de-entrada)
3. [Rate Limiting](#rate-limiting)
4. [Headers de Segurança](#headers-de-segurança)
5. [CORS](#cors)
6. [Proteção contra Fraude](#proteção-contra-fraude)
7. [Logs Seguros](#logs-seguros)
8. [Boas Práticas](#boas-práticas)

---

## 🔒 Proteção de Arquivos Sensíveis

### .gitignore
- Todos os arquivos `.env*` estão protegidos
- Arquivos de chaves e certificados não são commitados
- Logs e arquivos temporários são ignorados

### Variáveis de Ambiente
- **NUNCA** commite arquivos `.env` no Git
- Use variáveis de ambiente do Vercel/Render para produção
- Para desenvolvimento local, use `.env.local` (já está no `.gitignore`)

---

## ✅ Validação de Entrada

### Sanitização
- Todos os inputs são sanitizados antes do processamento
- Remoção de caracteres nulos (`\0`)
- Limitação de tamanho máximo de strings
- Validação de formato (WhatsApp, UUID)

### Validação com Zod
- Schema de validação rigoroso para todos os endpoints
- Mensagens de erro claras e específicas
- Validação de tipos e formatos

### Limites de Tamanho
- Payload máximo: 10KB para `/api/leads`
- Payload máximo: 5KB para `/api/referral/create`
- Payload máximo: 2KB para `/api/referral/track`
- Nome: máximo 100 caracteres
- WhatsApp: máximo 20 caracteres

---

## 🚦 Rate Limiting

### Endpoints Protegidos

#### `/api/leads`
- **Limite**: 10 requisições por 15 minutos por IP
- **Motivo**: Prevenir spam e abuso do formulário

#### `/api/referral/create`
- **Limite**: 5 requisições por hora por IP
- **Motivo**: Prevenir criação excessiva de contas de referrer

#### `/api/referral/track`
- **Limite**: 30 requisições por minuto por IP
- **Motivo**: Permitir tracking legítimo, mas prevenir abuso

### Implementação
- Rate limiting em memória (use Redis em produção para escala)
- Limpeza automática de entradas antigas
- Resposta HTTP 429 quando limite excedido

---

## 🛡️ Headers de Segurança

Todos os endpoints retornam os seguintes headers de segurança:

- **X-Frame-Options**: `DENY` - Previne clickjacking
- **X-Content-Type-Options**: `nosniff` - Previne MIME type sniffing
- **X-XSS-Protection**: `1; mode=block` - Proteção XSS
- **Referrer-Policy**: `strict-origin-when-cross-origin`
- **Permissions-Policy**: Restringe geolocalização, microfone, câmera
- **Content-Security-Policy**: Política de segurança de conteúdo
- **Strict-Transport-Security**: HSTS (apenas em produção com HTTPS)

---

## 🌐 CORS

### Desenvolvimento
- Permite origem da requisição
- Permite localhost para desenvolvimento

### Produção
- **Restritivo**: Apenas origens permitidas explicitamente
- Configurado via variáveis de ambiente:
  - `CORS_ALLOWED_ORIGIN`
  - `NEXT_PUBLIC_SITE_URL`
  - `REFERRAL_BASE_URL`

### Headers CORS
- `Access-Control-Allow-Origin`: Apenas origens permitidas
- `Access-Control-Allow-Credentials`: `true`
- `Access-Control-Allow-Methods`: `POST, OPTIONS`
- `Access-Control-Allow-Headers`: `Content-Type, Authorization, X-Requested-With`

---

## 🚨 Proteção contra Fraude

### Validações em Múltiplas Camadas

#### 1. Validação por WhatsApp
- Impede que o mesmo número seja usado múltiplas vezes com o mesmo código de indicação
- Normalização de formato para comparação

#### 2. Validação por IP
- Impede que o mesmo IP seja usado com o mesmo código de indicação
- Detecta tentativas de fraude usando o mesmo dispositivo/rede

#### 3. Validação Combinada (IP + User-Agent)
- Verifica combinação de IP e User-Agent
- Detecta tentativas de usar o mesmo dispositivo

#### 4. Validação por User-Agent (Threshold)
- Bloqueia se o mesmo User-Agent for usado 3+ vezes com o mesmo código
- Previne abuso mesmo com IPs diferentes

#### 5. Proteção contra Spam Geral
- Limite de 5 leads por IP por hora (mesmo sem referral_code)
- Retorna HTTP 429 quando limite excedido

---

## 📝 Logs Seguros

### Desenvolvimento
- Logs completos com stack traces
- Informações detalhadas para debugging

### Produção
- **Sem informações sensíveis** nos logs
- Apenas mensagens de erro genéricas
- Não expõe stack traces ou dados internos
- Logs sanitizados para não vazar dados

### O que NÃO é logado em produção:
- Stack traces completos
- Dados de requisição completos
- Informações de banco de dados
- Tokens ou senhas

---

## ✅ Boas Práticas Implementadas

### Backend
- ✅ Validação rigorosa de entrada
- ✅ Sanitização de dados
- ✅ Rate limiting
- ✅ Headers de segurança
- ✅ CORS restritivo em produção
- ✅ Logs seguros
- ✅ Proteção contra SQL Injection (Prisma)
- ✅ Validação de tamanho de payload
- ✅ Normalização de dados

### Frontend
- ✅ Validação de entrada no cliente
- ✅ Sanitização antes de enviar
- ✅ Tratamento de erros adequado
- ✅ Não expõe informações sensíveis

### Banco de Dados
- ✅ Prisma ORM (proteção contra SQL Injection)
- ✅ Validação de tipos
- ✅ Constraints de banco de dados

---

## 🔧 Configuração de Produção

### Variáveis de Ambiente Necessárias

```env
# Banco de dados
DATABASE_URL=postgresql://...

# CORS
CORS_ALLOWED_ORIGIN=https://seusite.com,https://outrosite.com
NEXT_PUBLIC_SITE_URL=https://seusite.com
REFERRAL_BASE_URL=https://seusite.com

# Discord (Notificações)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_BOT_TOKEN=seu_bot_token_aqui
DISCORD_USER_ID=seu_user_id_aqui

# Ambiente
NODE_ENV=production
```

### Checklist de Deploy

- [ ] Todas as variáveis de ambiente configuradas
- [ ] CORS configurado corretamente
- [ ] Rate limiting ativo
- [ ] Headers de segurança ativos
- [ ] Logs em modo produção
- [ ] `.env` não commitado no Git
- [ ] SSL/HTTPS configurado
- [ ] Banco de dados com SSL habilitado

---

## 🚨 Reportar Vulnerabilidades

Se você encontrar uma vulnerabilidade de segurança, **NÃO** abra uma issue pública.

Entre em contato diretamente através de:
- Email: [seu-email]
- Ou através do sistema de contato do site

---

## 📚 Recursos Adicionais

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Prisma Security](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management/security)

---

**Última atualização**: Novembro 2025

