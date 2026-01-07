/**
 * Cron endpoint to check for expired PIX payments and queue abandoned messages
 * This is a backup solution in case OpenPix webhooks don't fire on expiration
 * 
 * Should be called every 5-10 minutes by cron-job.org
 */

import prisma from '../../../lib/prisma'
import { queuePaymentAbandonedMessage } from '../../../utils/messageQueue'

// Secret token to validate cron requests (reuse the same one)
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
            checked: 0,
            expired: 0,
            queued: 0,
            errors: 0,
        }

        // Find all PIX transactions that are in "processing" state
        // (meaning PIX was generated but not paid yet)
        const pendingPixTransactions = await prisma.transaction.findMany({
            where: {
                payment_method: 'pix',
                status: { in: ['processing', 'requires_payment_method'] },
                created_at: {
                    // Only check transactions older than 16 minutes (PIX expires at 15 min)
                    lte: new Date(now.getTime() - 16 * 60 * 1000),
                },
            },
            include: {
                lead: true,
            },
            take: 50, // Process max 50 at a time
        })

        console.info(`[Check-Expired-PIX] Found ${pendingPixTransactions.length} pending PIX transactions`)

        for (const transaction of pendingPixTransactions) {
            results.checked++

            try {
                // Check how long ago this transaction was created
                const minutesSinceCreation = Math.floor((now.getTime() - transaction.created_at.getTime()) / 1000 / 60)

                if (minutesSinceCreation >= 16) {
                    // PIX has expired (15 min + 1 min buffer)
                    console.info(`[Check-Expired-PIX] Marking transaction ${transaction.id} as expired (created ${minutesSinceCreation} min ago)`)

                    // Update transaction status to canceled
                    await prisma.transaction.update({
                        where: { id: transaction.id },
                        data: { status: 'canceled' },
                    })

                    results.expired++

                    // Queue abandoned payment message
                    try {
                        await queuePaymentAbandonedMessage(transaction.lead)
                        console.info(`[Check-Expired-PIX] Queued abandoned message for lead ${transaction.lead_id}`)
                        results.queued++
                    } catch (queueError) {
                        console.error(`[Check-Expired-PIX] Error queuing message:`, queueError.message)
                        results.errors++
                    }
                }
            } catch (error) {
                console.error(`[Check-Expired-PIX] Error processing transaction ${transaction.id}:`, error.message)
                results.errors++
            }
        }

        console.info('[Check-Expired-PIX] Results:', results)
        return res.status(200).json({
            success: true,
            timestamp: now.toISOString(),
            ...results,
        })
    } catch (error) {
        console.error('[Check-Expired-PIX] Fatal error:', error.message)
        return res.status(500).json({
            success: false,
            error: error.message,
        })
    }
}
