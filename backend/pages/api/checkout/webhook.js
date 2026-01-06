import prisma from '../../../lib/prisma'
import stripe from '../../../utils/stripe'
import { sendPaymentNotification } from '../../../utils/discord'
import { queuePaymentConfirmedMessage, queuePaymentAbandonedMessage } from '../../../utils/messageQueue'

// Desabilitar parsing do body para receber o raw body
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
  // Aceitar GET para validação manual (retornar status ok)
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Webhook endpoint is active (Stripe)' })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET não configurado')
    return res.status(500).json({ error: 'Webhook não configurado' })
  }

  let event
  try {
    const rawBody = await getRawBody(req)
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

  // Buscar a transação
  const transaction = await prisma.transaction.findFirst({
    where: { stripe_payment_intent: paymentIntent.id },
    include: { lead: true, affiliate: true },
  })

  if (!transaction) {
    console.error(`Transação não encontrada para PI: ${paymentIntent.id}`)
    return
  }

  const alreadySucceeded = transaction.status === 'succeeded'
  const paymentMethod = paymentIntent.payment_method_types?.[0] === 'pix' ? 'pix' : 'card'

  // Atualizar status da transação
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: 'succeeded',
      payment_method: paymentMethod,
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

  if (!alreadySucceeded) {
    try {
      await sendPaymentNotification({
        type: 'payment_succeeded',
        provider: 'Stripe',
        lead: transaction.lead,
        affiliate: transaction.affiliate,
        transaction: { ...transaction, payment_method: paymentMethod },
      })
    } catch (notifyError) {
      console.error('[Stripe Webhook] Erro ao notificar pagamento aprovado:', notifyError.message)
    }

    // Enfileirar mensagem de confirmação via WhatsApp
    try {
      await queuePaymentConfirmedMessage(transaction.lead)
      console.info('[Stripe Webhook] Mensagem de confirmação enfileirada')
    } catch (whatsappError) {
      console.error('[Stripe Webhook] Erro ao enfileirar mensagem WhatsApp:', whatsappError.message)
    }
  }
}

// Handler para payment_intent.payment_failed
async function handlePaymentIntentFailed(paymentIntent) {
  console.log(`PaymentIntent failed: ${paymentIntent.id}`)

  // Manter como requires_payment_method para que o usuário possa tentar novamente
  await updateTransactionStatus(paymentIntent.id, 'requires_payment_method')

  // Buscar transação para enfileirar mensagem de abandono
  const transaction = await prisma.transaction.findFirst({
    where: { stripe_payment_intent: paymentIntent.id },
    include: { lead: true },
  })

  if (transaction) {
    try {
      await queuePaymentAbandonedMessage(transaction.lead)
      console.info('[Stripe Webhook] Mensagem de abandono enfileirada')
    } catch (whatsappError) {
      console.error('[Stripe Webhook] Erro ao enfileirar mensagem WhatsApp:', whatsappError.message)
    }
  }
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
