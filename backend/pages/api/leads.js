import { z } from 'zod'
import prisma from '../../lib/prisma'
import { applyCors } from '../../utils/cors'
import {
  extractIp,
  setSecurityHeaders,
  sanitizeString,
  validateWhatsApp,
  validateUUID,
  checkPayloadSize,
  sanitizeError,
  rateLimit,
} from '../../utils/security'
import { sendDiscordNotification } from '../../utils/discord'
import { queueLeadWelcomeMessage } from '../../utils/messageQueue'

// Rate limiter específico para leads (mais restritivo)
const leadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  maxRequests: 10, // Apenas 10 requisições por 15 minutos
})

const leadSchema = z.object({
  nome: z.string()
    .min(2, 'Informe seu nome completo')
    .max(100, 'Nome muito longo')
    .refine((val) => sanitizeString(val, 100) === val, 'Nome contém caracteres inválidos'),
  whatsapp: z.string()
    .min(8, 'Informe um WhatsApp válido')
    .max(20, 'WhatsApp inválido')
    .refine((val) => validateWhatsApp(val), 'WhatsApp inválido'),
  // Aceita UUID ou slug customizado (3-36 chars, alfanumérico com - e _)
  referral_code: z.string()
    .min(3, 'Código de indicação inválido')
    .max(36, 'Código de indicação inválido')
    .refine((val) => {
      // Aceita UUID
      if (validateUUID(val)) return true
      // Aceita slug customizado (letras, números, hífen, underscore)
      return /^[a-zA-Z0-9_-]+$/.test(val)
    }, 'Código de indicação inválido')
    .optional(),
  // Tracking ID do cookie para correlacionar mesma pessoa
  tracking_id: z.string().max(100).optional(),
})

// Normaliza o WhatsApp removendo caracteres especiais para comparação
const normalizeWhatsApp = (whatsapp) => {
  return whatsapp.replace(/\D/g, '') // Remove tudo que não é dígito
}

// Normaliza o User-Agent para comparação (remove variações menores)
const normalizeUserAgent = (userAgent) => {
  if (!userAgent || userAgent === 'unknown') return 'unknown'
  // Remove espaços extras e converte para lowercase para comparação
  return userAgent.trim().toLowerCase()
}

export default async function handler(req, res) {
  // Apply security headers
  setSecurityHeaders(req, res)

  if (applyCors(req, res)) {
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  // Check payload size (max 10KB)
  if (!checkPayloadSize(req, 1024 * 10)) {
    return res.status(413).json({ message: 'Payload muito grande' })
  }

  // Apply rate limiting
  if (leadRateLimit(req, res)) {
    return // Rate limit exceeded, response already sent
  }

  try {
    // Sanitize input before validation
    const sanitizedBody = {
      nome: sanitizeString(req.body?.nome || '', 100),
      whatsapp: sanitizeString(req.body?.whatsapp || '', 20),
      referral_code: req.body?.referral_code ? sanitizeString(req.body.referral_code, 36) : undefined,
      tracking_id: req.body?.tracking_id ? sanitizeString(req.body.tracking_id, 100) : undefined,
    }

    const data = leadSchema.parse(sanitizedBody)
    const normalizedWhatsApp = normalizeWhatsApp(data.whatsapp)
    const ip = extractIp(req)
    const userAgent = req.headers['user-agent'] || 'unknown'
    const normalizedUserAgent = normalizeUserAgent(userAgent)

    // Normalizar o referral_code para validações
    const normalizedReferralCode = data.referral_code?.toLowerCase()

    // Validações de segurança em múltiplas camadas quando há referral_code
    if (normalizedReferralCode) {
      const existingLeads = await prisma.lead.findMany({
        where: {
          referral_code: normalizedReferralCode,
        },
      })

      // Validação 1: Verifica se o mesmo WhatsApp já foi usado com o mesmo referral_code
      const duplicateWhatsApp = existingLeads.find((lead) => {
        const leadWhatsAppNormalized = normalizeWhatsApp(lead.whatsapp)
        return leadWhatsAppNormalized === normalizedWhatsApp
      })

      if (duplicateWhatsApp) {
        return res.status(400).json({
          message: 'Este número de WhatsApp já foi usado com este código de indicação. Cada pessoa só pode ser indicada uma vez.',
        })
      }

      // Validação 2: Verifica se o mesmo IP já foi usado com o mesmo referral_code
      if (ip && ip !== 'unknown') {
        const duplicateIp = existingLeads.find((lead) => {
          return lead.ip && lead.ip === ip
        })

        if (duplicateIp) {
          return res.status(400).json({
            message: 'Este endereço IP já foi usado com este código de indicação. Detectamos possível tentativa de fraude.',
          })
        }
      }

      // Validação 3: Verifica se a mesma combinação IP + User-Agent já foi usada
      if (ip && ip !== 'unknown' && normalizedUserAgent !== 'unknown') {
        const duplicateCombo = existingLeads.find((lead) => {
          const leadUserAgentNormalized = normalizeUserAgent(lead.user_agent)
          return (
            lead.ip &&
            lead.ip === ip &&
            leadUserAgentNormalized === normalizedUserAgent
          )
        })

        if (duplicateCombo) {
          return res.status(400).json({
            message: 'Esta combinação de dispositivo e localização já foi usada com este código de indicação. Detectamos possível tentativa de fraude.',
          })
        }
      }

      // Validação 4: Verifica se o mesmo User-Agent já foi usado múltiplas vezes (threshold de segurança)
      if (normalizedUserAgent !== 'unknown') {
        const sameUserAgentLeads = existingLeads.filter((lead) => {
          const leadUserAgentNormalized = normalizeUserAgent(lead.user_agent)
          return leadUserAgentNormalized === normalizedUserAgent
        })

        // Se o mesmo User-Agent foi usado 3 ou mais vezes, bloqueia
        if (sameUserAgentLeads.length >= 3) {
          return res.status(400).json({
            message: 'Muitas tentativas detectadas com o mesmo dispositivo. Por segurança, esta ação foi bloqueada.',
          })
        }
      }
    }

    // Validação: Verifica se o WhatsApp já está cadastrado (evita duplicidade)
    const existingLead = await prisma.lead.findFirst({
      where: {
        whatsapp: normalizedWhatsApp,
      },
      orderBy: {
        created_at: 'desc', // Pega o mais recente
      },
    })

    if (existingLead) {
      console.info('[Leads] Lead existente encontrado:', {
        id: existingLead.id,
      })

      // Retorna o lead existente em vez de criar duplicata
      return res.status(200).json({
        success: true,
        lead_id: existingLead.id,
        lead_name: existingLead.nome,
        message: 'Você já está cadastrado! Redirecionando para agendamento...',
        existing: true,
      })
    }

    // Validação adicional: Verifica tentativas de spam geral (sem referral_code também)
    // Se o mesmo IP tentar criar múltiplos leads em pouco tempo, bloqueia
    if (ip && ip !== 'unknown') {
      const recentLeadsSameIp = await prisma.lead.findMany({
        where: {
          ip: ip,
          created_at: {
            gte: new Date(Date.now() - 60 * 60 * 1000), // Última hora
          },
        },
      })

      // Limite de 5 leads por IP por hora (ajuste conforme necessário)
      if (recentLeadsSameIp.length >= 5) {
        return res.status(429).json({
          message: 'Muitas tentativas detectadas. Por favor, tente novamente mais tarde.',
        })
      }
    }

    // Buscar referrer se houver referral_code e verificar se está ativo
    let referrerNome = null
    let validReferralCode = null

    if (data.referral_code) {
      try {
        const referrer = await prisma.referrer.findUnique({
          where: {
            referral_code: data.referral_code.toLowerCase(),
          },
          select: {
            nome: true,
            ativo: true,
            referral_code: true,
          },
        })

        if (referrer && referrer.ativo) {
          referrerNome = referrer.nome
          validReferralCode = referrer.referral_code
        } else if (referrer && !referrer.ativo) {
          console.info('[Leads] Referrer inativo, ignorando código:', data.referral_code)
          // Não bloqueia, apenas ignora o código de referral inativo
        }
      } catch (error) {
        console.error('[Leads] Erro ao buscar referrer:', error.message)
        // Não bloqueia a criação do lead se falhar ao buscar o referrer
      }
    }

    const lead = await prisma.lead.create({
      data: {
        nome: data.nome,
        whatsapp: normalizedWhatsApp, // Salva o WhatsApp normalizado
        referral_code: validReferralCode, // Usa o código validado (null se inativo/inexistente)
        tracking_id: data.tracking_id || null, // Cookie ID para correlação
        ip: ip !== 'unknown' ? ip : null,
        user_agent: normalizedUserAgent !== 'unknown' ? userAgent : null,
      },
    })

    console.info('[Leads] Lead criado com sucesso:', {
      id: lead.id,
      referral_code: validReferralCode || null,
    })

    // Enviar notificação para Discord (DEVE aguardar em serverless)
    // Em ambiente serverless, se não aguardarmos, a função pode encerrar antes do envio
    console.info('[Leads] Iniciando envio de notificação Discord...')
    try {
      const discordSuccess = await sendDiscordNotification({
        nome: data.nome,
        whatsapp: normalizedWhatsApp,
        referrerNome: referrerNome,
      })

      if (discordSuccess) {
        console.info('[Leads] Notificação Discord enviada com sucesso')
      } else {
        console.warn('[Leads] Notificação Discord não foi enviada (verifique logs do Discord)')
      }
    } catch (discordError) {
      console.error('[Leads] Erro ao enviar notificação Discord:', discordError.message)
      // Não falha a requisição se o Discord falhar
    }

    // Enfileirar mensagem de boas-vindas via WhatsApp (será enviada após 2 minutos se não houver pagamento)
    console.info('[Leads] Enfileirando mensagem WhatsApp de boas-vindas...')
    try {
      await queueLeadWelcomeMessage({
        id: lead.id,
        nome: data.nome,
        whatsapp: normalizedWhatsApp,
      })
      console.info('[Leads] Mensagem WhatsApp enfileirada para envio em 2 minutos')
    } catch (whatsappError) {
      console.error('[Leads] Erro ao enfileirar mensagem WhatsApp:', whatsappError.message)
      // Não falha a requisição se o WhatsApp falhar
    }

    return res.status(201).json({
      success: true,
      lead_id: lead.id,
      lead_name: lead.nome,
    })
  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production'

    // Log error details only in development
    if (!isProduction) {
      console.error('Erro em /api/leads', error)
    } else {
      // In production, log without sensitive data
      console.error('Erro em /api/leads', {
        message: error.message,
        name: error.name,
      })
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Dados inválidos',
        issues: error.issues.map(issue => ({
          path: issue.path,
          message: issue.message,
        })),
      })
    }

    // Don't expose internal errors in production
    const errorResponse = sanitizeError(error, isProduction)
    return res.status(500).json(errorResponse)
  }
}
