import { z } from 'zod'
import prisma from '../../../lib/prisma'
import { createPixCharge } from '../../../utils/openpix'
import { sendPaymentNotification } from '../../../utils/discord'
import { applyCors } from '../../../utils/cors'
import {
  setSecurityHeaders,
  rateLimit,
  sanitizeError,
} from '../../../utils/security'
import { AMOUNT_PRODUCT, AMOUNT_AFFILIATE } from '../../../utils/stripe'

// Rate limiter para checkout
const checkoutRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 10,
})

// Schema de validação
const createPixSchema = z.object({
  lead_id: z.string().uuid('ID do lead inválido'),
  email: z.string().email('E-mail inválido'),
  cpf: z.string().length(11, 'CPF deve ter 11 dígitos').regex(/^\d+$/, 'CPF deve conter apenas números'),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido (HH:mm)'),
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
    const data = createPixSchema.parse(req.body)

    // Verificar se o lead existe
    const lead = await prisma.lead.findUnique({
      where: { id: data.lead_id },
    })

    if (!lead) {
      return res.status(404).json({ error: 'Lead não encontrado' })
    }

    // Atualizar email do lead
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

    // Verificar horário
    const scheduledDate = new Date(data.scheduled_date)
    const [hours] = data.scheduled_time.split(':').map(Number)

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
      return res.status(400).json({ error: 'Este horário já está ocupado.' })
    }

    // Cancelar transações pendentes anteriores deste lead (não pagas)
    await prisma.transaction.updateMany({
      where: {
        lead_id: lead.id,
        status: { in: ['requires_payment_method', 'processing', 'requires_action'] },
      },
      data: {
        status: 'canceled',
      },
    })

    // Criar transação no banco
    const transaction = await prisma.transaction.create({
      data: {
        lead_id: lead.id,
        affiliate_id: affiliate?.id || null,
        amount_product: AMOUNT_PRODUCT,
        amount_affiliate: AMOUNT_AFFILIATE,
        payment_method: 'pix',
        status: 'requires_payment_method',
        scheduled_date: scheduledDate,
        scheduled_time: new Date(`1970-01-01T${data.scheduled_time}:00`),
      },
    })

    // Criar cobrança PIX na OpenPix
    const pixCharge = await createPixCharge({
      correlationID: transaction.id,
      value: AMOUNT_PRODUCT,
      comment: `Otimização Windows - ${lead.nome}`,
      customer: {
        name: lead.nome,
        email: data.email,
        phone: lead.whatsapp,
        taxID: data.cpf, // CPF do cliente
      },
      expiresIn: 900, // 15 minutos
    })

    // Atualizar transação com dados do PIX
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        stripe_payment_intent: `openpix_${pixCharge.correlationID}`, // Usar campo existente para guardar referência
        status: 'processing',
      },
    })

    const leadForNotification = data.email ? { ...lead, email: data.email } : lead
    console.info('[Checkout] Iniciando notificacao de pagamento criado (OpenPix)...')
    try {
      const notified = await sendPaymentNotification({
        type: 'payment_created',
        provider: 'OpenPix',
        lead: leadForNotification,
        affiliate,
        transaction: updatedTransaction,
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
      transaction_id: transaction.id,
      pix: {
        brCode: pixCharge.brCode,
        qrCodeImage: pixCharge.qrCodeImage,
        expiresAt: pixCharge.expiresAt,
        value: AMOUNT_PRODUCT / 100, // Converter para reais
      },
    })
  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production'

    console.error('Erro em /api/checkout/create-pix:', error)

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Dados inválidos',
        issues: error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    if (error.message === 'OPENPIX_APP_ID não configurado') {
      return res.status(500).json({
        error: 'PIX não configurado. Entre em contato com o suporte.',
      })
    }

    const errorResponse = sanitizeError(error, isProduction)
    return res.status(500).json(errorResponse)
  }
}

