import { z } from 'zod'
import prisma from '../../../lib/prisma'
import { applyCors } from '../../../utils/cors'
import {
  setSecurityHeaders,
  sanitizeString,
  checkPayloadSize,
  sanitizeError,
  rateLimit,
} from '../../../utils/security'

// Rate limiter para atualização de PIX
const updatePixRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  maxRequests: 10, // 10 atualizações por hora
})

// Validação do token (64 caracteres hex)
const tokenSchema = z.string()
  .length(64, 'Token inválido')
  .regex(/^[a-f0-9]+$/, 'Token inválido')

const getAccessToken = (req) => {
  const authHeader = req.headers.authorization
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim()
  }

  const headerToken = req.headers['x-referral-token']
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim()
  }

  return req.query?.token
}

// Normaliza a chave PIX (remove +55 de telefone, mantém resto igual)
const normalizePixKey = (pixKey) => {
  // Se começa com +55, remove
  if (pixKey.startsWith('+55')) {
    return pixKey.substring(3)
  }
  return pixKey
}

// Verifica se é um telefone válido (com ou sem +55)
const isValidPhone = (val) => {
  // Com +55: +5511999999999
  if (/^\+55\d{10,11}$/.test(val)) return true
  // Sem +55: 11999999999 (DDD + número)
  if (/^\d{10,11}$/.test(val)) return true
  return false
}

// Validação da chave PIX
const pixKeySchema = z.object({
  pix_key: z.string()
    .min(5, 'Chave PIX muito curta')
    .max(140, 'Chave PIX muito longa')
    .refine((val) => {
      // Aceita CPF (11 dígitos) - mas só se não for telefone (telefone tem 10-11 dígitos também)
      // Diferenciamos: CPF sempre tem 11, telefone pode ter 10 ou 11
      // Se tem exatamente 11 dígitos, pode ser CPF ou telefone - aceitamos ambos
      if (/^\d{11}$/.test(val)) return true
      // Aceita telefone com 10 dígitos (fixo com DDD)
      if (/^\d{10}$/.test(val)) return true
      // Aceita CNPJ (14 dígitos)
      if (/^\d{14}$/.test(val)) return true
      // Aceita e-mail
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return true
      // Aceita telefone com +55
      if (/^\+55\d{10,11}$/.test(val)) return true
      // Aceita chave aleatória (32 caracteres)
      if (/^[a-zA-Z0-9-]{32,36}$/.test(val)) return true
      // Aceita formatos com máscara (CPF: xxx.xxx.xxx-xx, etc)
      const cleanVal = val.replace(/\D/g, '')
      if (cleanVal.length === 10 || cleanVal.length === 11 || cleanVal.length === 14) return true
      return false
    }, 'Chave PIX inválida. Use CPF, CNPJ, e-mail, telefone ou chave aleatória'),
})

export default async function handler(req, res) {
  // Apply security headers
  setSecurityHeaders(req, res)
  
  if (applyCors(req, res)) {
    return
  }

  if (req.method !== 'PUT' && req.method !== 'POST') {
    res.setHeader('Allow', 'PUT, POST')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  // Check payload size
  if (!checkPayloadSize(req, 1024 * 5)) {
    return res.status(413).json({ message: 'Payload muito grande' })
  }

  // Apply rate limiting
  if (updatePixRateLimit(req, res)) {
    return
  }

  try {
    // Validar token
    const rawToken = getAccessToken(req)
    const sanitizedToken = sanitizeString(rawToken || '', 64).toLowerCase()
    const token = tokenSchema.parse(sanitizedToken)

    // Buscar referrer pelo access_token
    const referrer = await prisma.referrer.findUnique({
      where: { access_token: token },
    })

    if (!referrer) {
      return res.status(401).json({
        message: 'Acesso não autorizado',
      })
    }

    // Validar e sanitizar a chave PIX
    const sanitizedBody = {
      pix_key: sanitizeString(req.body?.pix_key || '', 140).trim(),
    }

    const { pix_key } = pixKeySchema.parse(sanitizedBody)
    
    // Normaliza a chave PIX (remove +55 se for telefone)
    const normalizedPixKey = normalizePixKey(pix_key)

    // Atualizar a chave PIX
    await prisma.referrer.update({
      where: { id: referrer.id },
      data: { pix_key: normalizedPixKey },
    })

    console.info('[UpdatePix] Chave PIX atualizada:', {
      referrer_id: referrer.id,
      nome: referrer.nome,
      pix_key_masked: normalizedPixKey.substring(0, 4) + '***',
    })

    return res.status(200).json({
      success: true,
      message: 'Chave PIX cadastrada com sucesso!',
      pix_key: normalizedPixKey,
    })
  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production'
    
    if (!isProduction) {
      console.error('Erro em /api/referral/update-pix', error)
    } else {
      console.error('Erro em /api/referral/update-pix', {
        message: error.message,
        name: error.name,
      })
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: error.issues[0]?.message || 'Dados inválidos',
      })
    }

    const errorResponse = sanitizeError(error, isProduction)
    return res.status(500).json(errorResponse)
  }
}

