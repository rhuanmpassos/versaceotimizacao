/**
 * WhatsApp Message Queue Service
 * Handles scheduling and anti-flood logic for WhatsApp messages
 */

import prisma from '../lib/prisma'

// Delay in milliseconds for welcome message after lead registration
const WELCOME_MESSAGE_DELAY_MS = 2 * 60 * 1000 // 2 minutes

/**
 * Queue a welcome message for a new lead
 * This message will be sent 2 minutes after registration if no payment attempt is made
 * 
 * @param {object} lead - Lead data with id, nome, whatsapp
 */
export const queueLeadWelcomeMessage = async (lead) => {
    const { id: leadId, nome, whatsapp } = lead

    // Check if we already have a pending or sent welcome message for this lead
    const existing = await prisma.whatsAppMessage.findFirst({
        where: {
            lead_id: leadId,
            message_type: 'LEAD_WELCOME',
            status: { in: ['PENDING', 'SENT'] },
        },
    })

    if (existing) {
        console.info('[MessageQueue] Welcome message already queued/sent for lead:', leadId)
        return null
    }

    // Calculate when to send (2 minutes from now)
    const sendAfter = new Date(Date.now() + WELCOME_MESSAGE_DELAY_MS)

    const message = await prisma.whatsAppMessage.create({
        data: {
            lead_id: leadId,
            phone: whatsapp,
            message_type: 'LEAD_WELCOME',
            status: 'PENDING',
            send_after: sendAfter,
        },
    })

    console.info('[MessageQueue] Welcome message queued for lead:', leadId, 'send_after:', sendAfter)
    return message
}

/**
 * Queue a payment abandoned message for a lead
 * This is called when we detect a payment that wasn't completed
 * 
 * @param {object} lead - Lead data with id, nome, whatsapp
 */
export const queuePaymentAbandonedMessage = async (lead) => {
    const { id: leadId, nome, whatsapp } = lead

    // Check if payment was actually completed (don't send abandoned message)
    const successfulPayment = await prisma.transaction.findFirst({
        where: {
            lead_id: leadId,
            status: 'succeeded',
        },
    })

    if (successfulPayment) {
        console.info('[MessageQueue] Lead has successful payment, skipping abandoned message:', leadId)
        return null
    }

    // Check if we already have a pending or sent abandoned message for this lead
    const existing = await prisma.whatsAppMessage.findFirst({
        where: {
            lead_id: leadId,
            message_type: 'PAYMENT_ABANDONED',
            status: { in: ['PENDING', 'SENT'] },
        },
    })

    if (existing) {
        console.info('[MessageQueue] Abandoned message already queued/sent for lead:', leadId)
        return null
    }

    // Cancel any pending welcome message since they made a payment attempt
    await cancelPendingWelcomeMessage(leadId)

    // Send immediately (no delay for abandoned messages)
    const message = await prisma.whatsAppMessage.create({
        data: {
            lead_id: leadId,
            phone: whatsapp,
            message_type: 'PAYMENT_ABANDONED',
            status: 'PENDING',
            send_after: new Date(), // Send immediately
        },
    })

    console.info('[MessageQueue] Abandoned message queued for lead:', leadId)
    return message
}

/**
 * Queue a payment confirmed message for a lead
 * This is called when payment is successfully completed
 * 
 * @param {object} lead - Lead data with id, nome, whatsapp
 */
export const queuePaymentConfirmedMessage = async (lead) => {
    const { id: leadId, nome, whatsapp } = lead

    // Check if we already have a pending or sent confirmed message for this lead
    const existing = await prisma.whatsAppMessage.findFirst({
        where: {
            lead_id: leadId,
            message_type: 'PAYMENT_CONFIRMED',
            status: { in: ['PENDING', 'SENT'] },
        },
    })

    if (existing) {
        console.info('[MessageQueue] Confirmed message already queued/sent for lead:', leadId)
        return null
    }

    // Cancel any pending welcome or abandoned messages
    await cancelPendingWelcomeMessage(leadId)
    await cancelPendingAbandonedMessage(leadId)

    // Send immediately
    const message = await prisma.whatsAppMessage.create({
        data: {
            lead_id: leadId,
            phone: whatsapp,
            message_type: 'PAYMENT_CONFIRMED',
            status: 'PENDING',
            send_after: new Date(), // Send immediately
        },
    })

    console.info('[MessageQueue] Confirmed message queued for lead:', leadId)
    return message
}

/**
 * Cancel pending welcome message for a lead
 * Called when lead makes a payment attempt
 */
export const cancelPendingWelcomeMessage = async (leadId) => {
    const result = await prisma.whatsAppMessage.updateMany({
        where: {
            lead_id: leadId,
            message_type: 'LEAD_WELCOME',
            status: 'PENDING',
        },
        data: {
            status: 'CANCELLED',
        },
    })

    if (result.count > 0) {
        console.info('[MessageQueue] Cancelled', result.count, 'welcome message(s) for lead:', leadId)
    }

    return result.count
}

/**
 * Cancel pending abandoned message for a lead
 * Called when lead completes payment
 */
export const cancelPendingAbandonedMessage = async (leadId) => {
    const result = await prisma.whatsAppMessage.updateMany({
        where: {
            lead_id: leadId,
            message_type: 'PAYMENT_ABANDONED',
            status: 'PENDING',
        },
        data: {
            status: 'CANCELLED',
        },
    })

    if (result.count > 0) {
        console.info('[MessageQueue] Cancelled', result.count, 'abandoned message(s) for lead:', leadId)
    }

    return result.count
}

export default {
    queueLeadWelcomeMessage,
    queuePaymentAbandonedMessage,
    queuePaymentConfirmedMessage,
    cancelPendingWelcomeMessage,
    cancelPendingAbandonedMessage,
}
