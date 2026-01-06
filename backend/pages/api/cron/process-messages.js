/**
 * Cron endpoint to process WhatsApp message queue
 * This endpoint should be called every 2 minutes by an external cron service (cron-job.org)
 * 
 * Security: Uses a secret token to prevent unauthorized access
 */

import prisma from '../../../lib/prisma'
import { sendWhatsAppMessage, MessageTemplates } from '../../../utils/whatsapp'

// Secret token to validate cron requests
const CRON_SECRET = process.env.CRON_SECRET || 'versace-cron-secret-2024'

export default async function handler(req, res) {
    // Validate cron secret
    const authHeader = req.headers.authorization
    const providedSecret = authHeader?.replace('Bearer ', '') || req.query.secret

    if (providedSecret !== CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const now = new Date()
        const results = {
            processed: 0,
            sent: 0,
            failed: 0,
            cancelled: 0,
        }

        // 1. Get all pending messages that should be sent now
        const pendingMessages = await prisma.whatsAppMessage.findMany({
            where: {
                status: 'PENDING',
                send_after: {
                    lte: now,
                },
            },
            include: {
                lead: {
                    include: {
                        transactions: {
                            orderBy: { created_at: 'desc' },
                            take: 1,
                        },
                        meetings: {
                            orderBy: { created_at: 'desc' },
                            take: 1,
                        },
                    },
                },
            },
            orderBy: { send_after: 'asc' },
            take: 20, // Process max 20 messages per cron run to avoid timeout
        })

        console.info(`[Cron] Processing ${pendingMessages.length} pending messages`)

        for (const msg of pendingMessages) {
            results.processed++

            try {
                // Check if message should be cancelled based on current state
                const shouldCancel = await shouldCancelMessage(msg)

                if (shouldCancel) {
                    await prisma.whatsAppMessage.update({
                        where: { id: msg.id },
                        data: {
                            status: 'CANCELLED',
                            updated_at: now,
                        },
                    })
                    results.cancelled++
                    console.info(`[Cron] Message ${msg.id} cancelled: ${shouldCancel}`)
                    continue
                }

                // Generate message text based on type
                const messageText = await generateMessageText(msg)

                if (!messageText) {
                    await prisma.whatsAppMessage.update({
                        where: { id: msg.id },
                        data: {
                            status: 'FAILED',
                            error: 'Could not generate message text',
                            updated_at: now,
                        },
                    })
                    results.failed++
                    continue
                }

                // Send the message
                const result = await sendWhatsAppMessage(msg.phone, messageText)

                if (result.success) {
                    await prisma.whatsAppMessage.update({
                        where: { id: msg.id },
                        data: {
                            status: 'SENT',
                            message_text: messageText,
                            sent_at: now,
                            updated_at: now,
                        },
                    })
                    results.sent++
                    console.info(`[Cron] Message ${msg.id} sent successfully`)
                } else {
                    await prisma.whatsAppMessage.update({
                        where: { id: msg.id },
                        data: {
                            status: 'FAILED',
                            error: result.error,
                            updated_at: now,
                        },
                    })
                    results.failed++
                    console.error(`[Cron] Message ${msg.id} failed: ${result.error}`)
                }
            } catch (error) {
                console.error(`[Cron] Error processing message ${msg.id}:`, error.message)
                await prisma.whatsAppMessage.update({
                    where: { id: msg.id },
                    data: {
                        status: 'FAILED',
                        error: error.message,
                        updated_at: now,
                    },
                })
                results.failed++
            }
        }

        console.info('[Cron] Results:', results)
        return res.status(200).json({
            success: true,
            timestamp: now.toISOString(),
            ...results,
        })
    } catch (error) {
        console.error('[Cron] Fatal error:', error.message)
        return res.status(500).json({
            success: false,
            error: error.message,
        })
    }
}

/**
 * Check if a message should be cancelled based on current state
 */
async function shouldCancelMessage(msg) {
    const { lead, message_type } = msg
    const latestTransaction = lead.transactions?.[0]
    const hasPaymentAttempt = latestTransaction != null
    const paymentSucceeded = latestTransaction?.status === 'succeeded'

    switch (message_type) {
        case 'LEAD_WELCOME':
            // Cancel welcome message if lead already made a payment attempt or completed payment
            if (hasPaymentAttempt) return 'payment_attempted'
            if (paymentSucceeded) return 'payment_succeeded'
            break

        case 'PAYMENT_ABANDONED':
            // Cancel if payment was completed
            if (paymentSucceeded) return 'payment_succeeded'
            break

        case 'PAYMENT_CONFIRMED':
            // This should only be sent when payment is confirmed, no cancellation needed
            break
    }

    // Check if we already sent this type of message to this lead
    const existingSent = await prisma.whatsAppMessage.findFirst({
        where: {
            lead_id: msg.lead_id,
            message_type: msg.message_type,
            status: 'SENT',
            id: { not: msg.id },
        },
    })

    if (existingSent) return 'already_sent'

    return null
}

/**
 * Generate message text based on message type
 */
async function generateMessageText(msg) {
    const { lead, message_type } = msg
    const meeting = lead.meetings?.[0]

    switch (message_type) {
        case 'LEAD_WELCOME':
            return MessageTemplates.leadWelcome(lead.nome)

        case 'PAYMENT_ABANDONED':
            return MessageTemplates.paymentAbandoned(lead.nome)

        case 'PAYMENT_CONFIRMED':
            if (!meeting) {
                console.warn(`[Cron] No meeting found for confirmed payment message`)
                return null
            }
            return MessageTemplates.paymentConfirmed(
                lead.nome,
                meeting.meeting_date,
                meeting.meeting_time
            )

        default:
            return null
    }
}
