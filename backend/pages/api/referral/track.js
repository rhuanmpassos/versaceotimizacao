import { z } from 'zod'
import prisma from '../../../lib/prisma'
import { applyCors } from '../../../utils/cors'
import {
  extractIp,
  setSecurityHeaders,
  sanitizeString,
  validateUUID,
  checkPayloadSize,
  sanitizeError,
  rateLimit,
} from '../../../utils/security'
import { extractTrackingData } from '../../../utils/tracking'

// Rate limiter para tracking (mais permissivo)
const trackRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  maxRequests: 30, // 30 requisições por minuto
})

// Validação flexível: aceita UUID ou slug customizado (3-30 chars, alfanumérico com - e _)
const trackSchema = z.object({
  referral_code: z.string()
    .min(3, 'Código de indicação inválido')
    .max(36, 'Código de indicação inválido')
    .refine((val) => {
      // Aceita UUID
      if (validateUUID(val)) return true
      // Aceita slug customizado (letras, números, hífen, underscore)
      return /^[a-zA-Z0-9_-]+$/.test(val)
    }, 'Código de indicação inválido'),
  // Campos opcionais de tracking
  screen_width: z.number().int().positive().max(10000).optional().nullable(),
  screen_height: z.number().int().positive().max(10000).optional().nullable(),
  timezone: z.string().max(50).optional().nullable(),
  utm_source: z.string().max(50).optional().nullable(),
  utm_medium: z.string().max(50).optional().nullable(),
  utm_campaign: z.string().max(100).optional().nullable(),
})

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

  // Check payload size
  if (!checkPayloadSize(req, 1024 * 2)) {
    return res.status(413).json({ message: 'Payload muito grande' })
  }

  // Apply rate limiting
  if (trackRateLimit(req, res)) {
    return
  }

  try {
    // Sanitize input
    const sanitizedBody = {
      referral_code: sanitizeString(req.body?.referral_code || '', 36).toLowerCase(),
      screen_width: req.body?.screen_width ? parseInt(req.body.screen_width, 10) : null,
      screen_height: req.body?.screen_height ? parseInt(req.body.screen_height, 10) : null,
      timezone: sanitizeString(req.body?.timezone || '', 50) || null,
      utm_source: sanitizeString(req.body?.utm_source || '', 50) || null,
      utm_medium: sanitizeString(req.body?.utm_medium || '', 50) || null,
      utm_campaign: sanitizeString(req.body?.utm_campaign || '', 100) || null,
    }

    const { referral_code, ...trackingParams } = trackSchema.parse(sanitizedBody)
    
    // Verificar se o referrer existe e está ativo
    const referrer = await prisma.referrer.findUnique({ 
      where: { referral_code } 
    })

    console.info('[Track] Buscando referrer:', referral_code, '| Encontrado:', !!referrer, '| Ativo:', referrer?.ativo)

    // Se não existe ou está inativo, não rastreia mas não retorna erro
    if (!referrer || !referrer.ativo) {
      console.warn('[Track] Referrer não encontrado ou inativo:', referral_code)
      return res.status(200).json({
        tracked: false,
        message: 'Código de indicação não encontrado ou inativo',
      })
    }

    const ip = extractIp(req)
    const user_agent = sanitizeString(req.headers['user-agent'] || 'unknown', 500)
    
    // Extrair dados de tracking adicionais (do request + body)
    // includeLocation = false para não bloquear a resposta (pode ser feito async depois)
    const trackingData = await extractTrackingData(req, trackingParams, ip, false)

    // Verificar se este IP já foi registrado para este referral_code
    const existingHit = await prisma.referralHit.findFirst({
      where: {
        referral_code,
        ip,
      },
    })

    let isNewClick = false

    // Só registra se for um IP novo (1 clique por IP)
    if (!existingHit) {
      const hitData = {
        referral_code,
        ip,
        user_agent,
        ...trackingData,
      }
      await prisma.referralHit.create({
        data: hitData,
      })
      isNewClick = true
    } else {
    }

    // Contar total de cliques únicos (cada registro = 1 IP único)
    const totalClicks = await prisma.referralHit.count({ 
      where: { referral_code } 
    })

    return res.status(200).json({
      tracked: true,
      isNewClick,
      totalClicks,
      referrer: {
        nome: referrer.nome,
        tipo: referrer.tipo,
      },
    })
  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production'
    
    if (!isProduction) {
      console.error('Erro em /api/referral/track', error)
    } else {
      console.error('Erro em /api/referral/track', {
        message: error.message,
        name: error.name,
      })
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Código de indicação inválido',
        issues: error.issues.map(issue => ({
          path: issue.path,
          message: issue.message,
        })),
      })
    }

    const errorResponse = sanitizeError(error, isProduction)
    return res.status(500).json(errorResponse)
  }
}
