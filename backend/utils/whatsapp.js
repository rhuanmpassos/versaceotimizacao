/**
 * WAHA (WhatsApp HTTP API) Integration
 * Sends WhatsApp messages using the WAHA API hosted on Render
 */

const WAHA_API_URL = process.env.WAHA_API_URL || 'https://waha-whatsapp-d0pw.onrender.com'
const WAHA_API_KEY = process.env.WAHA_API_KEY || ''
const WAHA_SESSION = process.env.WAHA_SESSION || 'default'

/**
 * Returns greeting based on current time in Brazil
 * @returns {string} - "Bom dia", "Boa tarde", or "Boa noite"
 */
export const getGreeting = () => {
    // Get current hour in Brazil timezone (UTC-3)
    const now = new Date()
    const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    const hour = brazilTime.getHours()

    if (hour >= 5 && hour < 12) return 'Bom dia'
    if (hour >= 12 && hour < 18) return 'Boa tarde'
    return 'Boa noite'
}

/**
 * Formats a phone number to WhatsApp chat ID format
 * @param {string} phone - Phone number (with or without country code)
 * @returns {string} - Formatted chat ID (e.g., "5511999999999@c.us")
 */
export const formatChatId = (phone) => {
    // Remove all non-digit characters
    let digits = phone.replace(/\D/g, '')

    // If doesn't start with country code, assume Brazil (55)
    if (!digits.startsWith('55') && digits.length <= 11) {
        digits = '55' + digits
    }

    return `${digits}@c.us`
}

/**
 * Gets the first name from a full name
 * @param {string} fullName - Full name
 * @returns {string} - First name only
 */
export const getFirstName = (fullName) => {
    return fullName.split(' ')[0]
}

/**
 * Sends a WhatsApp text message using WAHA API
 * @param {string} phone - Recipient phone number
 * @param {string} message - Text message to send
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const sendWhatsAppMessage = async (phone, message) => {
    if (!WAHA_API_KEY) {
        console.warn('[WAHA] API key not configured, skipping WhatsApp message')
        return { success: false, error: 'API key not configured' }
    }

    const chatId = formatChatId(phone)

    try {
        const response = await fetch(`${WAHA_API_URL}/api/sendText`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': WAHA_API_KEY,
            },
            body: JSON.stringify({
                chatId,
                text: message,
                session: WAHA_SESSION,
            }),
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            const errorMsg = errorData.message || `HTTP ${response.status}`
            console.error('[WAHA] Failed to send message:', errorMsg)
            return { success: false, error: errorMsg }
        }

        const result = await response.json()
        console.info('[WAHA] Message sent successfully:', {
            chatId,
            messageId: result.key?.id,
            status: result.status,
        })
        return { success: true }
    } catch (error) {
        console.error('[WAHA] Error sending message:', error.message)
        return { success: false, error: error.message }
    }
}

/**
 * Message templates
 */
export const MessageTemplates = {
    /**
     * Message 1: Welcome message after registration (sent after 2min if no payment attempt)
     */
    leadWelcome: (nome) => {
        const greeting = getGreeting()
        const firstName = getFirstName(nome)
        return `Ola ${firstName}, ${greeting.toLowerCase()}, tudo bom? Vi que voce se cadastrou pra otimizacao, se tiver algum problema ou duvida pode me avisar`
    },

    /**
     * Message 2: Payment not completed
     */
    paymentAbandoned: (nome) => {
        const greeting = getGreeting()
        const firstName = getFirstName(nome)
        return `Ola ${firstName}, ${greeting.toLowerCase()}, tudo bom? Vi que voce gerou um pagamento mas nao confirmou, se tiver tido algum problema ou tiver alguma duvida, so falar`
    },

    /**
     * Message 3: Payment confirmed with meeting details
     */
    paymentConfirmed: (nome, meetingDate, meetingTime) => {
        const greeting = getGreeting()
        const firstName = getFirstName(nome)

        // Format date to Brazilian format
        const dateObj = new Date(meetingDate)
        const formattedDate = dateObj.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        })

        // Format time
        const timeObj = new Date(meetingTime)
        const formattedTime = timeObj.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
        })

        return `Ola ${firstName}, ${greeting.toLowerCase()}, tudo bom? Vi que voce efetivou a compra da otimizacao, seu horario e as ${formattedTime} e demoramos 4 horas pra fazer a otimizacao, caso queira remarcar, so me avisar, te espero no dia ${formattedDate} as ${formattedTime} pelo discord, forte abraco`
    },
}

export default {
    sendWhatsAppMessage,
    getGreeting,
    formatChatId,
    getFirstName,
    MessageTemplates,
}
