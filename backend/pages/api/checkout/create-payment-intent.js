import { z } from 'zod'
import prisma from '../../../lib/prisma'
import stripe, { AMOUNT_PRODUCT, AMOUNT_AFFILIATE } from '../../../utils/stripe'
import { sendPaymentNotification } from '../../../utils/discord'
import { applyCors } from '../../../utils/cors'
import {
  setSecurityHeaders,
  sanitizeString,
  rateLimit,
  sanitizeError,
} from '../../../utils/security'

// Rate limiter para checkout
const checkoutRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  maxRequests: 10, // 10 requisições por minuto
})

// Schema de validação
const createPaymentIntentSchema = z.object({
  lead_id: z.string().uuid('ID do lead inválido'),
  email: z.string().email('E-mail inválido'),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido (HH:mm)'),
  payment_method_type: z.enum(['card', 'pix']),
})

export default async function handler(req, res) {
  setSecurityHeaders(req, res)
  
  if (applyCors(req, res)) {
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  if (checkoutRateLimit(req, res)) {
    return
  }

  try {
    // Validar dados
    const data = createPaymentIntentSchema.parse(req.body)
    
    // Verificar se o lead existe
    const lead = await prisma.lead.findUnique({
      where: { id: data.lead_id },
    })

    if (!lead) {
      return res.status(404).json({ error: 'Lead não encontrado' })
    }

    // Atualizar email do lead se fornecido
    if (data.email && data.email !== lead.email) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { email: data.email },
      })
    }

    // Buscar afiliado (se houver referral_code)
    // Se o lead atual não tem referral_code, tentar correlacionar com lead anterior
    // usando múltiplos identificadores: WhatsApp, E-mail, IP+UserAgent
    let affiliate = null
    let referralCode = lead.referral_code

    if (!referralCode) {
      let originalLead = null

      // 1. Tentar por WhatsApp
      if (lead.whatsapp) {
        originalLead = await prisma.lead.findFirst({
          where: {
            whatsapp: lead.whatsapp,
            referral_code: { not: null },
            id: { not: lead.id },
          },
          orderBy: { created_at: 'asc' },
        })
      }

      // 2. Tentar por E-mail
      if (!originalLead && lead.email) {
        originalLead = await prisma.lead.findFirst({
          where: {
            email: lead.email,
            referral_code: { not: null },
            id: { not: lead.id },
          },
          orderBy: { created_at: 'asc' },
        })
      }

      // 3. Tentar por Tracking ID (cookie)
      if (!originalLead && lead.tracking_id) {
        originalLead = await prisma.lead.findFirst({
          where: {
            tracking_id: lead.tracking_id,
            referral_code: { not: null },
            id: { not: lead.id },
          },
          orderBy: { created_at: 'asc' },
        })
      }

      // 4. Tentar por IP + User Agent (fingerprint básico)
      if (!originalLead && lead.ip && lead.user_agent) {
        originalLead = await prisma.lead.findFirst({
          where: {
            ip: lead.ip,
            user_agent: lead.user_agent,
            referral_code: { not: null },
            id: { not: lead.id },
          },
          orderBy: { created_at: 'asc' },
        })
      }

      // Se encontrou lead original, herdar o referral_code
      if (originalLead) {
        referralCode = originalLead.referral_code
        
        // Atualizar o lead atual com o referral_code
        await prisma.lead.update({
          where: { id: lead.id },
          data: { referral_code: referralCode },
        })
      }
    }

    if (referralCode) {
      affiliate = await prisma.referrer.findUnique({
        where: { referral_code: referralCode },
      })
    }

    // Verificar se o horário está disponível
    const scheduledDate = new Date(data.scheduled_date)
    const [hours, minutes] = data.scheduled_time.split(':').map(Number)
    
    // Verificar se não é antes das 14:00
    if (hours < 14) {
      return res.status(400).json({ error: 'Horário não disponível. Apenas após às 14:00.' })
    }

    // Verificar se já existe uma transação APROVADA para este lead
    const existingApproved = await prisma.transaction.findFirst({
      where: {
        lead_id: lead.id,
        status: 'succeeded',
      },
    })

    if (existingApproved) {
      return res.status(400).json({ 
        error: 'Este cliente já possui um agendamento aprovado.',
        code: 'ALREADY_PAID',
      })
    }

    // Verificar se já existe reunião neste horário
    const existingMeeting = await prisma.meeting.findFirst({
      where: {
        meeting_date: scheduledDate,
        meeting_time: new Date(`1970-01-01T${data.scheduled_time}:00`),
        status: { not: 'cancelled' },
      },
    })

    if (existingMeeting) {
      return res.status(400).json({ error: 'Este horário já está ocupado. Por favor, escolha outro.' })
    }

    // Cancelar transações pendentes anteriores deste lead
    await prisma.transaction.updateMany({
      where: {
        lead_id: lead.id,
        status: { in: ['requires_payment_method', 'processing', 'requires_action', 'requires_confirmation'] },
      },
      data: {
        status: 'canceled',
      },
    })

    // Criar PaymentIntent no Stripe
    const paymentIntentData = {
      amount: AMOUNT_PRODUCT,
      currency: 'brl',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        lead_id: lead.id,
        lead_name: lead.nome,
        affiliate_id: affiliate?.id || '',
        affiliate_code: lead.referral_code || '',
        scheduled_date: data.scheduled_date,
        scheduled_time: data.scheduled_time,
        amount_product: AMOUNT_PRODUCT.toString(),
        amount_affiliate: AMOUNT_AFFILIATE.toString(),
      },
      receipt_email: data.email,
    }

    // Se for PIX, configurar especificamente
    if (data.payment_method_type === 'pix') {
      paymentIntentData.payment_method_types = ['pix']
      paymentIntentData.payment_method_options = {
        pix: {
          expires_after_seconds: 3600, // 1 hora para expirar
        },
      }
      delete paymentIntentData.automatic_payment_methods
    } else {
      // Para cartão, habilitar parcelamento
      paymentIntentData.payment_method_types = ['card']
      paymentIntentData.payment_method_options = {
        card: {
          installments: {
            enabled: true,
          },
        },
      }
      delete paymentIntentData.automatic_payment_methods
    }

    let paymentIntent
    try {
      paymentIntent = await stripe.paymentIntents.create(paymentIntentData)
    } catch (stripeError) {
      // Se PIX não está habilitado, retornar erro específico
      if (stripeError.code === 'payment_intent_invalid_parameter' && 
          data.payment_method_type === 'pix') {
        return res.status(400).json({
          error: 'PIX não está habilitado. Por favor, use cartão de crédito ou habilite o PIX no Dashboard do Stripe.',
          code: 'PIX_NOT_ENABLED',
        })
      }
      throw stripeError
    }

    // Criar transação no banco
    const transaction = await prisma.transaction.create({
      data: {
        lead_id: lead.id,
        affiliate_id: affiliate?.id || null,
        amount_product: AMOUNT_PRODUCT,
        amount_affiliate: AMOUNT_AFFILIATE,
        payment_method: data.payment_method_type,
        stripe_payment_intent: paymentIntent.id,
        status: 'requires_payment_method',
        scheduled_date: scheduledDate,
        scheduled_time: new Date(`1970-01-01T${data.scheduled_time}:00`),
      },
    })

    const leadForNotification = data.email ? { ...lead, email: data.email } : lead
    console.info('[Checkout] Iniciando notificacao de pagamento criado (Stripe)...')
    try {
      const notified = await sendPaymentNotification({
        type: 'payment_created',
        provider: 'Stripe',
        lead: leadForNotification,
        affiliate,
        transaction,
      })

      if (notified) {
        console.info('[Checkout] Notificacao de pagamento criado enviada')
      } else {
        console.warn('[Checkout] Notificacao de pagamento criado nao enviada')
      }
    } catch (notifyError) {
      console.error('[Checkout] Erro ao enviar notificacao de pagamento criado:', notifyError.message)
    }

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      transaction_id: transaction.id,
      payment_intent_id: paymentIntent.id,
    })
  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production'
    
    console.error('Erro em /api/checkout/create-payment-intent:', error)

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Dados inválidos',
        issues: error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const errorResponse = sanitizeError(error, isProduction)
    return res.status(500).json(errorResponse)
  }
}

