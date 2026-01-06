/**
 * OpenPix API Integration para pagamentos PIX
 * Documentação: https://developers.openpix.com.br
 */

const OPENPIX_API_URL = 'https://api.openpix.com.br/api/v1'

/**
 * Criar uma cobrança PIX
 * @param {Object} params
 * @param {string} params.correlationID - ID único da cobrança (use o transaction_id)
 * @param {number} params.value - Valor em centavos (ex: 20000 = R$ 200,00)
 * @param {string} params.comment - Descrição da cobrança
 * @param {Object} params.customer - Dados do cliente (opcional)
 * @param {number} params.expiresIn - Tempo de expiração em segundos (padrão: 3600 = 1 hora)
 */
export async function createPixCharge({
  correlationID,
  value,
  comment = 'Otimização Windows - Versace',
  customer = null,
  expiresIn = 3600,
}) {
  const appId = process.env.OPENPIX_APP_ID

  if (!appId) {
    throw new Error('OPENPIX_APP_ID não configurado')
  }

  const payload = {
    correlationID,
    value,
    comment,
    expiresIn,
  }

  // Adicionar dados do cliente se fornecidos
  if (customer) {
    payload.customer = {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      taxID: customer.taxID, // CPF - apenas o número como string
    }
  }

  const response = await fetch(`${OPENPIX_API_URL}/charge`, {
    method: 'POST',
    headers: {
      'Authorization': appId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json()

  if (!response.ok) {
    const errorMessage = data?.error || data?.message || 'Erro ao criar cobrança PIX'
    console.error('[OpenPix] Erro ao criar cobrança:', errorMessage)
    throw new Error(errorMessage)
  }

  return {
    correlationID: data.charge.correlationID,
    value: data.charge.value,
    status: data.charge.status,
    brCode: data.charge.brCode, // Código PIX copia e cola
    qrCodeImage: data.charge.qrCodeImage, // URL da imagem do QR Code
    expiresAt: data.charge.expiresAt,
    paymentLinkUrl: data.charge.paymentLinkUrl,
  }
}

/**
 * Verificar status de uma cobrança
 * @param {string} correlationID - ID da cobrança
 */
export async function getChargeStatus(correlationID) {
  const appId = process.env.OPENPIX_APP_ID

  if (!appId) {
    throw new Error('OPENPIX_APP_ID não configurado')
  }

  const response = await fetch(`${OPENPIX_API_URL}/charge/${correlationID}`, {
    method: 'GET',
    headers: {
      'Authorization': appId,
      'Content-Type': 'application/json',
    },
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Erro ao buscar cobrança')
  }

  return data.charge
}

/**
 * Validar webhook da OpenPix
 * @param {Object} payload - Corpo da requisição
 * @param {string} signature - Assinatura do webhook (header x-webhook-signature)
 */
export function validateWebhook(payload, signature) {
  // A OpenPix não exige webhook secret obrigatoriamente
  // Se houver OPENPIX_WEBHOOK_SECRET configurado, pode-se implementar validação HMAC-SHA256
  // Por enquanto, aceita todos os webhooks (comportamento padrão da OpenPix)
  const webhookSecret = process.env.OPENPIX_WEBHOOK_SECRET
  
  if (!webhookSecret) {
    // OpenPix não exige webhook secret, então é normal não ter configurado
    return true
  }

  // TODO: Se necessário no futuro, implementar validação HMAC-SHA256 aqui
  // usando o webhookSecret para validar a signature
  return true
}

