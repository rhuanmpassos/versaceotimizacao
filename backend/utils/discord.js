/**
 * Discord notification utilities
 */

/**
 * Format WhatsApp number for display
 */
function formatWhatsApp(num) {
  const cleaned = num.replace(/\D/g, '')
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`
  }
  return num
}

/**
 * Build message content and embed
 */
function buildMessage({ nome, whatsapp, referrerNome = null }) {
  let content = `🎯 **Novo Lead Recebido!**\n\n`
  content += `**Nome:** ${nome}\n`
  content += `**WhatsApp:** ${formatWhatsApp(whatsapp)}\n`

  if (referrerNome) {
    content += `**Indicado por:** ${referrerNome}\n`
  }

  const embed = {
    title: '📋 Detalhes do Lead',
    color: referrerNome ? 0x00ff00 : 0x0099ff, // Green if referred, blue otherwise
    fields: [
      {
        name: 'Nome',
        value: nome,
        inline: true,
      },
      {
        name: 'WhatsApp',
        value: formatWhatsApp(whatsapp),
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  }

  if (referrerNome) {
    embed.fields.push({
      name: 'Indicado por',
      value: referrerNome,
      inline: false,
    })
  }

  return { content, embed }
}

/**
 * Send notification via webhook (channel)
 */
async function sendWebhookNotification({ nome, whatsapp, referrerNome = null }) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL

  if (!webhookUrl) {
    console.warn('[Discord] DISCORD_WEBHOOK_URL não configurada')
    return false
  }

  try {
    const { content, embed } = buildMessage({ nome, whatsapp, referrerNome })

    const payload = {
      content: content,
      username: 'Lead Bot',
      embeds: [embed],
    }

    console.info('[Discord] Enviando webhook de lead')

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Discord] Erro ao enviar webhook:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      })
      return false
    }

    const responseData = await response.json().catch(() => null)
    console.info('[Discord] Webhook enviado com sucesso', responseData)
    return true
  } catch (error) {
    console.error('[Discord] Erro ao enviar webhook:', {
      message: error.message,
      stack: error.stack,
    })
    return false
  }
}

/**
 * Send direct message via Discord API
 */
async function sendDirectMessage({ nome, whatsapp, referrerNome = null }) {
  let botToken = process.env.DISCORD_BOT_TOKEN
  let userId = process.env.DISCORD_USER_ID

  // Remove quotes and trim whitespace
  if (botToken) {
    botToken = botToken.trim().replace(/^["']|["']$/g, '')
  }
  if (userId) {
    userId = userId.trim().replace(/^["']|["']$/g, '')
  }

  if (!botToken || !userId) {
    console.warn('[Discord] DISCORD_BOT_TOKEN ou DISCORD_USER_ID não configurados', {
      hasBotToken: !!botToken,
      hasUserId: !!userId,
    })
    return false
  }

  // Validate token format (Discord bot tokens are typically 59+ characters)
  if (botToken.length < 50) {
    console.error('[Discord] DISCORD_BOT_TOKEN parece inválido (muito curto)')
    return false
  }

  try {
    // Não verificamos o token a cada envio - isso adiciona latência desnecessária
    // Se o token estiver inválido, o erro será capturado ao tentar criar o canal DM
    console.info('[Discord] Criando canal DM para usuário:', userId)
    
    // Step 1: Create DM channel
    const dmChannelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient_id: userId,
      }),
    })

    if (!dmChannelResponse.ok) {
      const errorText = await dmChannelResponse.text()
      let errorDetails
      try {
        errorDetails = JSON.parse(errorText)
      } catch {
        errorDetails = errorText
      }
      
      console.error('[Discord] Erro ao criar canal DM:', {
        status: dmChannelResponse.status,
        statusText: dmChannelResponse.statusText,
        error: errorDetails,
      })
      
      // Se for 401, o token está inválido
      if (dmChannelResponse.status === 401) {
        console.error('[Discord] Erro 401: Token do bot inválido ou expirado.')
        console.error('[Discord] ⚠️  Acesse https://discord.com/developers/applications e gere um novo token.')
      } else if (dmChannelResponse.status === 403) {
        console.error('[Discord] Bot não tem permissão para enviar DMs para este usuário.')
        console.error('[Discord] Dica: O usuário pode ter bloqueado DMs de bots ou o bot não está no mesmo servidor.')
      }
      
      return false
    }

    const dmChannel = await dmChannelResponse.json()
    const channelId = dmChannel.id
    console.info('[Discord] Canal DM criado:', channelId)

    // Step 2: Send message to DM channel
    const { content, embed } = buildMessage({ nome, whatsapp, referrerNome })

    const messagePayload = {
      content: content,
      embeds: [embed],
    }

    console.info('[Discord] Enviando mensagem para canal DM:', channelId)

    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    })

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text()
      console.error('[Discord] Erro ao enviar DM:', {
        status: messageResponse.status,
        statusText: messageResponse.statusText,
        error: errorText,
      })
      return false
    }

    const messageData = await messageResponse.json().catch(() => null)
    console.info('[Discord] DM enviada com sucesso', messageData)
    return true
  } catch (error) {
    console.error('[Discord] Erro ao enviar DM:', {
      message: error.message,
      stack: error.stack,
    })
    return false
  }
}

function formatCurrency(amountCents) {
  if (typeof amountCents !== 'number') {
    return 'N/A'
  }
  const formatted = (amountCents / 100).toFixed(2).replace('.', ',')
  return `R$ ${formatted}`
}

const pad2 = (value) => String(value).padStart(2, '0')

function formatDateUtc(date) {
  if (!(date instanceof Date)) {
    return 'N/A'
  }
  const day = pad2(date.getUTCDate())
  const month = pad2(date.getUTCMonth() + 1)
  const year = date.getUTCFullYear()
  return `${day}/${month}/${year}`
}

function formatTimeUtc(time) {
  if (!(time instanceof Date)) {
    return 'N/A'
  }
  const hours = pad2(time.getUTCHours())
  const minutes = pad2(time.getUTCMinutes())
  return `${hours}:${minutes}`
}

function formatSchedule(scheduledDate, scheduledTime) {
  const dateLabel = scheduledDate instanceof Date ? formatDateUtc(scheduledDate) : null
  const timeLabel = scheduledTime instanceof Date ? formatTimeUtc(scheduledTime) : null

  if (dateLabel && timeLabel) {
    return `${dateLabel} ${timeLabel}`
  }
  return dateLabel || timeLabel || 'N/A'
}

function formatPaymentMethod(method) {
  if (!method) {
    return 'N/A'
  }
  return method === 'pix' ? 'PIX' : 'Cartao'
}

function buildPaymentMessage({ type, lead, transaction, affiliate, provider }) {
  const details = type === 'payment_created'
    ? { content: '**Pagamento gerado**', title: 'Pagamento gerado', color: 0xf1c40f }
    : { content: '**Pagamento aprovado**', title: 'Pagamento aprovado', color: 0x2ecc71 }

  const leadData = lead || transaction?.lead || {}
  const affiliateData = affiliate || transaction?.affiliate || null

  const fields = [
    { name: 'Nome', value: leadData.nome || 'N/A', inline: true },
    { name: 'WhatsApp', value: leadData.whatsapp ? formatWhatsApp(leadData.whatsapp) : 'N/A', inline: true },
    { name: 'Email', value: leadData.email || 'N/A', inline: true },
    { name: 'Valor', value: formatCurrency(transaction?.amount_product), inline: true },
    { name: 'Metodo', value: formatPaymentMethod(transaction?.payment_method), inline: true },
    { name: 'Provedor', value: provider || 'N/A', inline: true },
    { name: 'Agendamento', value: formatSchedule(transaction?.scheduled_date, transaction?.scheduled_time), inline: false },
  ]

  if (transaction?.id) {
    fields.push({ name: 'Transacao', value: transaction.id, inline: false })
  }

  if (transaction?.stripe_payment_intent) {
    fields.push({ name: 'Referencia', value: transaction.stripe_payment_intent, inline: false })
  }

  if (affiliateData?.nome) {
    fields.push({ name: 'Indicado por', value: affiliateData.nome, inline: false })
  }

  const embed = {
    title: details.title,
    color: details.color,
    fields,
    timestamp: new Date().toISOString(),
  }

  return { content: details.content, embed }
}

async function sendWebhookPaymentNotification({ type, lead, transaction, affiliate, provider }) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL

  if (!webhookUrl) {
    console.warn('[Discord] DISCORD_WEBHOOK_URL nao configurada para pagamento')
    return false
  }

  try {
    const { content, embed } = buildPaymentMessage({ type, lead, transaction, affiliate, provider })

    const payload = {
      content: content,
      username: 'Payment Bot',
      embeds: [embed],
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Discord] Erro ao enviar webhook de pagamento:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      })
      return false
    }

    return true
  } catch (error) {
    console.error('[Discord] Erro ao enviar webhook de pagamento:', {
      message: error.message,
      stack: error.stack,
    })
    return false
  }
}

async function sendPaymentDirectMessage({ type, lead, transaction, affiliate, provider }) {
  let botToken = process.env.DISCORD_BOT_TOKEN
  let userId = process.env.DISCORD_USER_ID

  if (botToken) {
    botToken = botToken.trim().replace(/^["']|["']$/g, '')
  }
  if (userId) {
    userId = userId.trim().replace(/^["']|["']$/g, '')
  }

  if (!botToken || !userId) {
    console.warn('[Discord] DISCORD_BOT_TOKEN ou DISCORD_USER_ID nao configurados para pagamento', {
      hasBotToken: !!botToken,
      hasUserId: !!userId,
    })
    return false
  }

  if (botToken.length < 50) {
    console.error('[Discord] DISCORD_BOT_TOKEN parece invalido (muito curto)')
    return false
  }

  try {
    const dmChannelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient_id: userId,
      }),
    })

    if (!dmChannelResponse.ok) {
      const errorText = await dmChannelResponse.text()
      let errorDetails
      try {
        errorDetails = JSON.parse(errorText)
      } catch {
        errorDetails = errorText
      }

      console.error('[Discord] Erro ao criar canal DM para pagamento:', {
        status: dmChannelResponse.status,
        statusText: dmChannelResponse.statusText,
        error: errorDetails,
      })
      return false
    }

    const dmChannel = await dmChannelResponse.json()
    const channelId = dmChannel.id

    const { content, embed } = buildPaymentMessage({ type, lead, transaction, affiliate, provider })
    const messagePayload = {
      content: content,
      embeds: [embed],
    }

    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    })

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text()
      console.error('[Discord] Erro ao enviar DM de pagamento:', {
        status: messageResponse.status,
        statusText: messageResponse.statusText,
        error: errorText,
      })
      return false
    }

    return true
  } catch (error) {
    console.error('[Discord] Erro ao enviar DM de pagamento:', {
      message: error.message,
      stack: error.stack,
    })
    return false
  }
}

/**
 * Build admin notification message
 */
function buildAdminMessage({ type, email, discordId, provider, name, slug, influencerName }) {
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  
  const messages = {
    unauthorized_access: {
      content: `⚠️ **Tentativa de Acesso ao Admin**`,
      embed: {
        title: '🚨 Acesso Não Autorizado',
        color: 0xff0000, // Vermelho
        fields: [
          { name: 'Email', value: email || 'N/A', inline: true },
          { name: 'Discord ID', value: discordId || 'N/A', inline: true },
          { name: 'Provider', value: provider || 'N/A', inline: true },
          { name: 'Nome', value: name || 'N/A', inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: `Tentativa bloqueada em ${timestamp}` },
      },
    },
    admin_login: {
      content: `✅ **Admin Logou no Painel**`,
      embed: {
        title: '🔐 Login Autorizado',
        color: 0x00ff00, // Verde
        fields: [
          { name: 'Email', value: email || 'N/A', inline: true },
          { name: 'Provider', value: provider || 'N/A', inline: true },
          { name: 'Nome', value: name || 'N/A', inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: `Login em ${timestamp}` },
      },
    },
    influencer_created: {
      content: `🎉 **Novo Influencer Cadastrado**`,
      embed: {
        title: '📢 Influencer Criado',
        color: 0x9b59b6, // Roxo
        fields: [
          { name: 'Nome', value: influencerName || 'N/A', inline: true },
          { name: 'Slug', value: slug || 'N/A', inline: true },
          { name: 'Criado por', value: email || 'N/A', inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: `Criado em ${timestamp}` },
      },
    },
    influencer_toggled: {
      content: `🔄 **Status de Influencer Alterado**`,
      embed: {
        title: '⚙️ Status Atualizado',
        color: 0xf39c12, // Laranja
        fields: [
          { name: 'Nome', value: influencerName || 'N/A', inline: true },
          { name: 'Slug', value: slug || 'N/A', inline: true },
          { name: 'Alterado por', value: email || 'N/A', inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: `Alterado em ${timestamp}` },
      },
    },
  }
  
  return messages[type] || messages.admin_login
}

/**
 * Send admin notification via webhook
 */
async function sendAdminWebhookNotification(options) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL

  if (!webhookUrl) {
    console.warn('[Discord] DISCORD_WEBHOOK_URL não configurada para admin')
    return false
  }

  try {
    const { content, embed } = buildAdminMessage(options)

    const payload = {
      content: content,
      username: 'Admin Bot',
      embeds: [embed],
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Discord] Erro ao enviar webhook admin:', {
        status: response.status,
        error: errorText,
      })
      return false
    }

    return true
  } catch (error) {
    console.error('[Discord] Erro ao enviar webhook admin:', error.message)
    return false
  }
}

/**
 * Send admin notification to Discord
 * @param {Object} options - Notification options
 * @param {string} options.type - Type: 'unauthorized_access', 'admin_login', 'influencer_created', 'influencer_toggled'
 * @returns {Promise<boolean>} Success status
 */
export async function sendAdminNotification(options) {
  console.info('[Discord] Enviando notificação admin:', options.type)
  return sendAdminWebhookNotification(options)
}

/**
 * Send notification to Discord (both webhook and DM)
 * @param {Object} options - Notification options
 * @param {string} options.nome - Lead name
 * @param {string} options.whatsapp - Lead WhatsApp number
 * @param {string} options.referrerNome - Referrer name (optional)
 * @returns {Promise<boolean>} Success status (true if at least one succeeded)
 */
export async function sendDiscordNotification({ nome, whatsapp, referrerNome = null }) {
  console.info('[Discord] Iniciando envio de notificações...', {
    hasWebhookUrl: !!process.env.DISCORD_WEBHOOK_URL,
    hasBotToken: !!process.env.DISCORD_BOT_TOKEN,
    hasUserId: !!process.env.DISCORD_USER_ID,
  })

  // Send both webhook and DM in parallel
  const [webhookSuccess, dmSuccess] = await Promise.allSettled([
    sendWebhookNotification({ nome, whatsapp, referrerNome }),
    sendDirectMessage({ nome, whatsapp, referrerNome }),
  ])

  // Log results
  if (webhookSuccess.status === 'rejected') {
    console.error('[Discord] Webhook falhou:', webhookSuccess.reason)
  } else {
    console.info('[Discord] Webhook resultado:', webhookSuccess.value)
  }

  if (dmSuccess.status === 'rejected') {
    console.error('[Discord] DM falhou:', dmSuccess.reason)
  } else {
    console.info('[Discord] DM resultado:', dmSuccess.value)
  }

  const webhookOk = webhookSuccess.status === 'fulfilled' && webhookSuccess.value === true
  const dmOk = dmSuccess.status === 'fulfilled' && dmSuccess.value === true

  console.info('[Discord] Resultado final:', { webhookOk, dmOk, success: webhookOk || dmOk })

  // Return true if at least one succeeded
  return webhookOk || dmOk
}

/**
 * Send payment notification to Discord (webhook and DM)
 * @param {Object} options - Notification options
 * @param {string} options.type - Type: 'payment_created' | 'payment_succeeded'
 * @param {Object} options.lead - Lead data
 * @param {Object} options.transaction - Transaction data
 * @param {Object} options.affiliate - Affiliate data (optional)
 * @param {string} options.provider - Provider label (Stripe/OpenPix)
 * @returns {Promise<boolean>} Success status
 */
export async function sendPaymentNotification({ type, lead, transaction, affiliate, provider }) {
  console.info('[Discord] Iniciando notificacao de pagamento...', {
    type,
    provider,
    hasWebhookUrl: !!process.env.DISCORD_WEBHOOK_URL,
    hasBotToken: !!process.env.DISCORD_BOT_TOKEN,
    hasUserId: !!process.env.DISCORD_USER_ID,
  })

  const [webhookSuccess, dmSuccess] = await Promise.allSettled([
    sendWebhookPaymentNotification({ type, lead, transaction, affiliate, provider }),
    sendPaymentDirectMessage({ type, lead, transaction, affiliate, provider }),
  ])

  if (webhookSuccess.status === 'rejected') {
    console.error('[Discord] Webhook de pagamento falhou:', webhookSuccess.reason)
  } else {
    console.info('[Discord] Webhook de pagamento resultado:', webhookSuccess.value)
  }

  if (dmSuccess.status === 'rejected') {
    console.error('[Discord] DM de pagamento falhou:', dmSuccess.reason)
  } else {
    console.info('[Discord] DM de pagamento resultado:', dmSuccess.value)
  }

  const webhookOk = webhookSuccess.status === 'fulfilled' && webhookSuccess.value === true
  const dmOk = dmSuccess.status === 'fulfilled' && dmSuccess.value === true

  console.info('[Discord] Resultado final pagamento:', { webhookOk, dmOk, success: webhookOk || dmOk })

  return webhookOk || dmOk
}

