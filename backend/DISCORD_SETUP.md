# Configuração do Discord - Resolução de Problemas

## Problema: Erro 401 Unauthorized ao enviar DM

Se você está recebendo erro 401 ao tentar enviar mensagens diretas, o token do bot está inválido ou expirado.

## Como corrigir:

### 1. Verificar o Token do Bot

1. Acesse: https://discord.com/developers/applications
2. Selecione sua aplicação (ou crie uma nova)
3. Vá em **Bot** no menu lateral
4. Em **Token**, clique em **Reset Token** ou **Copy** para copiar o token atual
5. O token deve ter aproximadamente 59-70 caracteres

### 2. Verificar se o Bot está Ativo

1. Na mesma página **Bot**, verifique se o bot está **Online**
2. Se não estiver, você pode precisar reiniciar o bot ou verificar se há problemas

### 3. Verificar Permissões do Bot

Para enviar DMs, o bot precisa:
- Ter um token válido
- Estar autorizado a enviar mensagens

### 4. Atualizar o Token no .env.local

No arquivo `backend/.env.local`, atualize o token:

```env
DISCORD_BOT_TOKEN="SEU_NOVO_TOKEN_AQUI"
```

**Importante:**
- Não inclua espaços extras
- Se o token já estiver entre aspas no arquivo, mantenha as aspas
- Se não estiver entre aspas, não precisa adicionar

### 5. Reiniciar o Servidor

Após atualizar o token, **reinicie completamente o servidor Next.js**:
1. Pare o servidor (Ctrl+C)
2. Inicie novamente (`npm run dev`)

### 6. Testar Novamente

Crie um novo lead e verifique os logs. Você deve ver:
- `[Discord] Bot verificado: NomeDoBot` - significa que o token está válido
- Se ainda der erro 401, o token ainda está incorreto

## Alternativa: Usar apenas Webhook

Se você não conseguir fazer o bot funcionar para DMs, você pode usar apenas o webhook (que já está funcionando). O webhook envia mensagens no canal configurado.

Para desabilitar tentativas de DM, você pode remover ou comentar as variáveis:
```env
# DISCORD_BOT_TOKEN="..."
# DISCORD_USER_ID="..."
```

O sistema continuará funcionando apenas com o webhook.

## Verificação Rápida

Execute este comando no terminal (substitua SEU_TOKEN pelo seu token):

```bash
curl -H "Authorization: Bot SEU_TOKEN" https://discord.com/api/v10/users/@me
```

Se retornar informações do bot, o token está válido.
Se retornar 401, o token está inválido.

