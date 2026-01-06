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

// Rate limiter para stats (proteção contra brute force)
const statsRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  maxRequests: 20, // 20 requisições por minuto
})

// Validação do token (64 caracteres hex)
const tokenSchema = z.object({
  token: z.string()
    .length(64, 'Token inválido')
    .regex(/^[a-f0-9]+$/, 'Token inválido'),
})

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

// Constantes de liberação de pagamento (em dias)
const CARD_RELEASE_DAYS = 31
const PIX_RELEASE_DAYS = 7

export default async function handler(req, res) {
  // Apply security headers
  setSecurityHeaders(req, res)
  
  if (applyCors(req, res)) {
    return
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  // Apply rate limiting (proteção contra brute force)
  if (statsRateLimit(req, res)) {
    return
  }

  try {
    // Sanitize input
    const rawToken = getAccessToken(req)
    const sanitizedToken = sanitizeString(rawToken || '', 64).toLowerCase()

    const { token } = tokenSchema.parse({ token: sanitizedToken })
    
    // Buscar o referrer pelo access_token
    const referrer = await prisma.referrer.findUnique({
      where: { access_token: token },
    })

    // Se não existe, retorna erro genérico (não revelar se token existe ou não)
    if (!referrer) {
      return res.status(401).json({
        message: 'Acesso não autorizado',
      })
    }

    // Contar total de cliques (ReferralHit)
    const totalClicks = await prisma.referralHit.count({
      where: { referral_code: referrer.referral_code },
    })

    // Contar leads/indicações que vieram desse referral_code
    const totalReferrals = await prisma.lead.count({
      where: { referral_code: referrer.referral_code },
    })

    // Buscar TODAS as transações deste afiliado (para mostrar pendentes, expiradas, etc)
    const allTransactions = await prisma.transaction.findMany({
      where: { 
        affiliate_id: referrer.id,
      },
      select: {
        id: true,
        amount_affiliate: true,
        payment_method: true,
        status: true,
        created_at: true,
        scheduled_date: true,
        scheduled_time: true,
      },
      orderBy: { created_at: 'desc' },
    })

    // Filtrar transações bem-sucedidas para cálculo de ganhos
    const transactions = allTransactions.filter(t => t.status === 'succeeded')

    // Calcular valores
    const now = new Date()
    let totalEarnings = 0
    let pendingEarnings = 0
    let availableEarnings = 0

    const salesData = transactions.map(tx => {
      const amountAffiliate = tx.amount_affiliate / 100 // Converter de centavos para reais
      totalEarnings += amountAffiliate

      // Calcular data de liberação
      const createdAt = new Date(tx.created_at)
      const releaseDays = tx.payment_method === 'pix' ? PIX_RELEASE_DAYS : CARD_RELEASE_DAYS
      const releaseDate = new Date(createdAt)
      releaseDate.setDate(releaseDate.getDate() + releaseDays)

      const isReleased = now >= releaseDate

      if (isReleased) {
        availableEarnings += amountAffiliate
      } else {
        pendingEarnings += amountAffiliate
      }

      return {
        id: tx.id,
        amount: amountAffiliate,
        paymentMethod: tx.payment_method,
        createdAt: tx.created_at,
        releaseDate: releaseDate.toISOString(),
        isReleased,
      }
    })

    const totalConverted = transactions.length

    // Buscar histórico de indicações (sem expor dados sensíveis)
    const referrals = await prisma.lead.findMany({
      where: { referral_code: referrer.referral_code },
      select: {
        id: true,
        stage: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
      take: 100, // Limitar para não sobrecarregar a resposta
    })

    // Formatar indicações para o frontend (sem dados pessoais)
    const formattedReferrals = referrals
      .slice(0, 50) // Limitar a 50
      .map(r => ({
        id: r.id,
        label: 'Indicação',
        status: r.stage === 'COMPRADO' ? 'Convertido' : 
                r.stage === 'EM_CONTATO' ? 'Em contato' : 
                r.stage === 'REJEITADO' ? 'Não converteu' : 'Pendente',
        data: r.created_at,
      }))

    // Mapear status para português
    const statusMap = {
      'requires_payment_method': 'Aguardando Pagamento',
      'requires_confirmation': 'Aguardando Confirmação',
      'processing': 'Processando',
      'requires_action': 'Ação Necessária',
      'requires_capture': 'Aguardando Captura',
      'canceled': 'Cancelado/Expirado',
      'succeeded': 'Aprovado',
    }

    // Preparar dados das transações (sem dados pessoais)
    const allTransactionsData = allTransactions.map(tx => {
      const amountAffiliate = tx.amount_affiliate / 100
      const createdAt = new Date(tx.created_at)
      
      // Calcular data de liberação (só para aprovados)
      let releaseDate = null
      let isReleased = false
      
      if (tx.status === 'succeeded') {
        const releaseDays = tx.payment_method === 'pix' ? PIX_RELEASE_DAYS : CARD_RELEASE_DAYS
        releaseDate = new Date(createdAt)
        releaseDate.setDate(releaseDate.getDate() + releaseDays)
        isReleased = now >= releaseDate
      }

      return {
        id: tx.id,
        label: 'Cliente',
        amount: amountAffiliate,
        paymentMethod: tx.payment_method,
        status: tx.status,
        statusLabel: statusMap[tx.status] || tx.status,
        createdAt: tx.created_at,
        scheduledDate: tx.scheduled_date,
        scheduledTime: tx.scheduled_time,
        releaseDate: releaseDate?.toISOString() || null,
        isReleased,
      }
    })

    // Ordenar por data (mais recente primeiro)
    allTransactionsData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    // Contar por status
    const pendingPayments = allTransactions.filter(t => 
      ['requires_payment_method', 'processing', 'requires_action'].includes(t.status)
    ).length
    const canceledPayments = allTransactions.filter(t => t.status === 'canceled').length

    return res.status(200).json({
      referrer: {
        nome: referrer.nome,
        referral_code: referrer.referral_code,
        pix_key: referrer.pix_key || null,
        created_at: referrer.created_at,
      },
      stats: {
        totalClicks,
        totalReferrals,
        totalConverted,
        totalEarnings,
        pendingEarnings,
        availableEarnings,
        pendingPayments,     // Quantidade aguardando pagamento
        canceledPayments,    // Quantidade cancelado/expirado
        // Manter compatibilidade com versão anterior
        earnings: totalEarnings,
        freeOptimization: totalConverted >= 5,
        remainingForFree: Math.max(0, 5 - totalConverted),
      },
      sales: salesData,
      transactions: allTransactionsData, // TODAS as transações com status
      referrals: formattedReferrals,
      paymentInfo: {
        cardReleaseDays: CARD_RELEASE_DAYS,
        pixReleaseDays: PIX_RELEASE_DAYS,
      },
    })
  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production'
    
    if (!isProduction) {
      console.error('Erro em /api/referral/stats', error)
    } else {
      console.error('Erro em /api/referral/stats', {
        message: error.message,
        name: error.name,
      })
    }

    if (error instanceof z.ZodError) {
      return res.status(401).json({
        message: 'Acesso não autorizado',
      })
    }

    const errorResponse = sanitizeError(error, isProduction)
    return res.status(500).json(errorResponse)
  }
}
