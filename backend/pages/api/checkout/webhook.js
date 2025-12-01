import prisma from '../../../lib/prisma'
import stripe from '../../../utils/stripe'
import { validateWebhook } from '../../../utils/openpix'

// Desabilitar parsing do body para receber o raw body (necessário para Stripe)
export const config = {
  api: {
    bodyParser: false,
  },
}

// Helper para ler o raw body
async function getRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  // Aceitar GET/HEAD para validação do webhook pela OpenPix
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.status(200).json({ status: 'ok', message: 'Webhook endpoint is active' })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET, HEAD')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  // Detectar se é OpenPix ou Stripe baseado nos headers
  const isOpenPix = req.headers['x-webhook-signature'] !== undefined
  const isStripe = req.headers['stripe-signature'] !== undefined

  // Ler o raw body uma vez (não pode ser lido duas vezes)
  const rawBody = await getRawBody(req)

  if (isOpenPix) {
    return handleOpenPixWebhook(req, res, rawBody)
  } else if (isStripe) {
    return handleStripeWebhook(req, res, rawBody)
  } else {
    return res.status(400).json({ error: 'Webhook signature not recognized' })
  }
}

/**
 * Handler para webhook da OpenPix
 */
async function handleOpenPixWebhook(req, res, rawBody) {
  try {
    // Para OpenPix, precisamos parsear o body
    const payload = JSON.parse(rawBody.toString())
    const signature = req.headers['x-webhook-signature']

    // Validar webhook
    if (!validateWebhook(payload, signature)) {
      console.error('[OpenPix Webhook] Assinatura inválida')
      return res.status(401).json({ error: 'Assinatura inválida' })
    }

    console.log('[OpenPix Webhook] Evento recebido:', payload.event)

    // A OpenPix envia diferentes tipos de eventos
    const { event, charge } = payload

    if (!charge || !charge.correlationID) {
      console.warn('[OpenPix Webhook] Payload sem correlationID')
      return res.status(200).json({ received: true })
    }

    const transactionId = charge.correlationID

    // Buscar transação
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    })

    if (!transaction) {
      console.error('[OpenPix Webhook] Transação não encontrada:', transactionId)
      return res.status(200).json({ received: true })
    }

    switch (event) {
      case 'OPENPIX:CHARGE_COMPLETED':
        await handleChargeCompleted(transaction, charge)
        break

      case 'OPENPIX:CHARGE_EXPIRED':
        await handleChargeExpired(transaction)
        break

      case 'OPENPIX:CHARGE_CREATED':
        console.log('[OpenPix Webhook] Cobrança criada:', transactionId)
        break

      default:
        console.log('[OpenPix Webhook] Evento não tratado:', event)
    }

    return res.status(200).json({ received: true })
  } catch (error) {
    console.error('[OpenPix Webhook] Erro:', error)
    return res.status(500).json({ error: 'Erro ao processar webhook' })
  }
}

/**
 * Handler para pagamento PIX confirmado
 */
async function handleChargeCompleted(transaction, charge) {
  console.log('[OpenPix] Pagamento confirmado:', transaction.id)

  // Atualizar status da transação
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: 'succeeded',
    },
  })

  // Verificar se a reunião já existe
  const existingMeeting = await prisma.meeting.findUnique({
    where: { transaction_id: transaction.id },
  })

  if (!existingMeeting) {
    // Criar a reunião
    await prisma.meeting.create({
      data: {
        transaction_id: transaction.id,
        lead_id: transaction.lead_id,
        affiliate_id: transaction.affiliate_id,
        meeting_date: transaction.scheduled_date,
        meeting_time: transaction.scheduled_time,
        status: 'scheduled',
      },
    })

    console.log('[OpenPix] Meeting criada para transação', transaction.id)
  }

  // Atualizar lead para COMPRADO
  await prisma.lead.update({
    where: { id: transaction.lead_id },
    data: { stage: 'COMPRADO' },
  })

  console.log('[OpenPix] Lead atualizado para COMPRADO:', transaction.lead_id)
}

/**
 * Handler para cobrança expirada
 */
async function handleChargeExpired(transaction) {
  console.log('[OpenPix] Cobrança expirada:', transaction.id)

  // Atualizar status para cancelado
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: 'canceled',
    },
  })
}

/**
 * Handler para webhook do Stripe
 */
async function handleStripeWebhook(req, res, rawBody) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET não configurado')
    return res.status(500).json({ error: 'Webhook não configurado' })
  }

  let event
  try {
    const signature = req.headers['stripe-signature']

    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('Erro ao verificar webhook:', err.message)
    return res.status(400).json({ error: `Webhook Error: ${err.message}` })
  }

  // Processar eventos
  try {
    switch (event.type) {
      case 'payment_intent.created':
        await handlePaymentIntentCreated(event.data.object)
        break

      case 'payment_intent.processing':
        await handlePaymentIntentProcessing(event.data.object)
        break

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object)
        break

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object)
        break

      case 'payment_intent.canceled':
        await handlePaymentIntentCanceled(event.data.object)
        break

      case 'payment_intent.requires_action':
        await handlePaymentIntentRequiresAction(event.data.object)
        break

      default:
        console.log(`Evento não tratado: ${event.type}`)
    }

    return res.status(200).json({ received: true })
  } catch (error) {
    console.error(`Erro ao processar evento ${event.type}:`, error)
    return res.status(500).json({ error: 'Erro ao processar evento' })
  }
}

// Handler para payment_intent.created
async function handlePaymentIntentCreated(paymentIntent) {
  console.log(`PaymentIntent created: ${paymentIntent.id}`)
  
  await updateTransactionStatus(paymentIntent.id, 'requires_payment_method')
}

// Handler para payment_intent.processing
async function handlePaymentIntentProcessing(paymentIntent) {
  console.log(`PaymentIntent processing: ${paymentIntent.id}`)
  
  await updateTransactionStatus(paymentIntent.id, 'processing')
}

// Handler para payment_intent.requires_action
async function handlePaymentIntentRequiresAction(paymentIntent) {
  console.log(`PaymentIntent requires_action: ${paymentIntent.id}`)
  
  await updateTransactionStatus(paymentIntent.id, 'requires_action')
}

// Handler para payment_intent.succeeded - O MAIS IMPORTANTE!
async function handlePaymentIntentSucceeded(paymentIntent) {
  console.log(`PaymentIntent succeeded: ${paymentIntent.id}`)
  
  const { lead_id, affiliate_id, scheduled_date, scheduled_time } = paymentIntent.metadata

  // Buscar a transação
  const transaction = await prisma.transaction.findFirst({
    where: { stripe_payment_intent: paymentIntent.id },
  })

  if (!transaction) {
    console.error(`Transação não encontrada para PI: ${paymentIntent.id}`)
    return
  }

  // Atualizar status da transação
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: 'succeeded',
      payment_method: paymentIntent.payment_method_types?.[0] === 'pix' ? 'pix' : 'card',
    },
  })

  // Verificar se a reunião já existe
  const existingMeeting = await prisma.meeting.findUnique({
    where: { transaction_id: transaction.id },
  })

  if (!existingMeeting) {
    // Criar a reunião (APENAS AQUI o agendamento é confirmado!)
    await prisma.meeting.create({
      data: {
        transaction_id: transaction.id,
        lead_id: transaction.lead_id,
        affiliate_id: transaction.affiliate_id,
        meeting_date: transaction.scheduled_date,
        meeting_time: transaction.scheduled_time,
        status: 'scheduled',
      },
    })

    console.log(`Meeting criada para transação ${transaction.id}`)
  }

  // Atualizar stage do lead para COMPRADO
  await prisma.lead.update({
    where: { id: transaction.lead_id },
    data: { stage: 'COMPRADO' },
  })

  console.log(`Lead ${transaction.lead_id} atualizado para COMPRADO`)
}

// Handler para payment_intent.payment_failed
async function handlePaymentIntentFailed(paymentIntent) {
  console.log(`PaymentIntent failed: ${paymentIntent.id}`)
  
  // Manter como requires_payment_method para que o usuário possa tentar novamente
  await updateTransactionStatus(paymentIntent.id, 'requires_payment_method')
}

// Handler para payment_intent.canceled
async function handlePaymentIntentCanceled(paymentIntent) {
  console.log(`PaymentIntent canceled: ${paymentIntent.id}`)
  
  await updateTransactionStatus(paymentIntent.id, 'canceled')
}

// Helper para atualizar status da transação
async function updateTransactionStatus(paymentIntentId, status) {
  try {
    await prisma.transaction.updateMany({
      where: { stripe_payment_intent: paymentIntentId },
      data: { status },
    })
  } catch (error) {
    console.error(`Erro ao atualizar status da transação:`, error)
  }
}

