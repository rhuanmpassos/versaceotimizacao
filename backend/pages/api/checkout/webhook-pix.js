import prisma from '../../../lib/prisma'
import { validateWebhook } from '../../../utils/openpix'

/**
 * Webhook da OpenPix para receber notificações de pagamento PIX
 * Documentação: https://developers.openpix.com.br/docs/webhook/webhook-overview
 */
export default async function handler(req, res) {
  // Aceitar GET/HEAD para validação do webhook pela OpenPix
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.status(200).json({ status: 'ok', message: 'Webhook endpoint is active' })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET, HEAD')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const signature = req.headers['x-webhook-signature']
    const payload = req.body

    // Validar webhook
    if (!validateWebhook(payload, signature)) {
      console.error('[OpenPix Webhook] Assinatura inválida')
      return res.status(401).json({ error: 'Assinatura inválida' })
    }

    console.log('[OpenPix Webhook] Evento recebido:', payload.event)

    // A OpenPix envia diferentes tipos de eventos
    // Principais: OPENPIX:CHARGE_COMPLETED, OPENPIX:CHARGE_EXPIRED
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
        // Apenas log, não precisa fazer nada
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

