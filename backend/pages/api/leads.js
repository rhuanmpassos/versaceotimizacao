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
  referral_code: z.string()
    .uuid('Código de indicação inválido')
    .optional()
    .refine((val) => !val || validateUUID(val), 'Código de indicação inválido'),
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
    }

    const data = leadSchema.parse(sanitizedBody)
    const normalizedWhatsApp = normalizeWhatsApp(data.whatsapp)
    const ip = extractIp(req)
    const userAgent = req.headers['user-agent'] || 'unknown'
    const normalizedUserAgent = normalizeUserAgent(userAgent)

    // Validações de segurança em múltiplas camadas quando há referral_code
    if (data.referral_code) {
      const existingLeads = await prisma.lead.findMany({
        where: {
          referral_code: data.referral_code,
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

    // Buscar nome do referrer se houver referral_code
    let referrerNome = null
    if (data.referral_code) {
      try {
        const referrer = await prisma.referrer.findUnique({
          where: {
            referral_code: data.referral_code,
          },
          select: {
            nome: true,
          },
        })
        if (referrer) {
          referrerNome = referrer.nome
        }
      } catch (error) {
        console.error('[Leads] Erro ao buscar referrer:', error.message)
        // Não bloqueia a criação do lead se falhar ao buscar o referrer
      }
    }

    const lead = await prisma.lead.create({
      data: {
        ...data,
        whatsapp: normalizedWhatsApp, // Salva o WhatsApp normalizado
        ip: ip !== 'unknown' ? ip : null,
        user_agent: normalizedUserAgent !== 'unknown' ? userAgent : null,
      },
    })

    console.info('[Leads] Lead criado com sucesso:', {
      id: lead.id,
      nome: data.nome,
      whatsapp: normalizedWhatsApp,
      referral_code: data.referral_code || null,
      referrerNome: referrerNome || null,
    })

    // Enviar notificação para Discord (não bloqueia a resposta)
    console.info('[Leads] Iniciando envio de notificação Discord...')
    sendDiscordNotification({
      nome: data.nome,
      whatsapp: normalizedWhatsApp,
      referrerNome: referrerNome,
    })
      .then((success) => {
        if (success) {
          console.info('[Leads] Notificação Discord enviada com sucesso')
        } else {
          console.warn('[Leads] Notificação Discord não foi enviada (verifique logs do Discord)')
        }
      })
      .catch((error) => {
        console.error('[Leads] Erro ao enviar notificação Discord:', error)
        console.error('[Leads] Stack trace:', error.stack)
        // Não falha a requisição se o Discord falhar
      })

    return res.status(201).json({ success: true })
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
