/**
 * Utilities para extrair dados de tracking de requisições
 */

/**
 * Extrai tipo de dispositivo do User-Agent
 */
export function getDeviceType(userAgent) {
  if (!userAgent) return null
  
  const ua = userAgent.toLowerCase()
  
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    return 'mobile'
  }
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    return 'tablet'
  }
  return 'desktop'
}

/**
 * Extrai sistema operacional do User-Agent
 */
export function getOS(userAgent) {
  if (!userAgent) return null
  
  const ua = userAgent.toLowerCase()
  
  if (ua.includes('windows')) return 'Windows'
  if (ua.includes('mac os x') || ua.includes('macintosh')) return 'macOS'
  if (ua.includes('linux')) return 'Linux'
  if (ua.includes('android')) return 'Android'
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS'
  if (ua.includes('chrome os')) return 'Chrome OS'
  
  return 'Unknown'
}

/**
 * Extrai navegador do User-Agent
 */
export function getBrowser(userAgent) {
  if (!userAgent) return null
  
  const ua = userAgent.toLowerCase()
  
  if (ua.includes('edg/')) return 'Edge'
  if (ua.includes('chrome/') && !ua.includes('edg/')) return 'Chrome'
  if (ua.includes('firefox/')) return 'Firefox'
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari'
  if (ua.includes('opera/') || ua.includes('opr/')) return 'Opera'
  if (ua.includes('msie') || ua.includes('trident/')) return 'IE'
  
  return 'Unknown'
}

/**
 * Extrai referrer da URL (domínio de origem)
 */
export function getReferrerDomain(referrer) {
  if (!referrer) return null
  
  try {
    const url = new URL(referrer)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Sanitiza e limita tamanho de string
 */
function sanitize(str, maxLength = 100) {
  if (!str || typeof str !== 'string') return null
  return str.trim().substring(0, maxLength) || null
}

/**
 * Obtém localização via IP (opcional, usa API gratuita)
 * Retorna null se falhar ou se IP for localhost
 */
export async function getLocationFromIP(ip) {
  // Não fazer lookup para IPs locais
  if (!ip || ip === 'unknown' || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country: null, city: null, region: null }
  }

  try {
    // Usar ip-api.com (gratuito, 45 req/min)
    const response = await fetch(`https://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city`, {
      timeout: 2000,
    })
    
    if (!response.ok) return { country: null, city: null, region: null }
    
    const data = await response.json()
    
    if (data.status === 'success') {
      return {
        country: sanitize(data.countryCode, 2),
        city: sanitize(data.city, 100),
        region: sanitize(data.regionName, 100),
      }
    }
  } catch (error) {
    // Falha silenciosa - não é crítico
    console.debug('[Tracking] Erro ao obter localização:', error.message)
  }

  return { country: null, city: null, region: null }
}

/**
 * Extrai todos os dados de tracking de uma requisição
 * @param {Object} req - Request object
 * @param {Object} query - Query parameters do body
 * @param {string} ip - IP address (para geolocalização)
 * @param {boolean} includeLocation - Se deve buscar localização via IP (default: false para não bloquear)
 */
export async function extractTrackingData(req, query = {}, ip = null, includeLocation = false) {
  const userAgent = req.headers['user-agent'] || ''
  const referrer = req.headers['referer'] || req.headers['referrer'] || null
  
  const baseData = {
    // Dados de navegação
    referrer: getReferrerDomain(referrer),
    utm_source: sanitize(query.utm_source, 50),
    utm_medium: sanitize(query.utm_medium, 50),
    utm_campaign: sanitize(query.utm_campaign, 100),
    
    // Dados de dispositivo
    device_type: getDeviceType(userAgent),
    os: getOS(userAgent),
    browser: getBrowser(userAgent),
    screen_width: query.screen_width ? parseInt(query.screen_width, 10) || null : null,
    screen_height: query.screen_height ? parseInt(query.screen_height, 10) || null : null,
    
    // Dados técnicos
    language: sanitize(req.headers['accept-language']?.split(',')[0], 10),
    timezone: sanitize(query.timezone, 50),
    
    // Localização (será preenchida se includeLocation = true)
    country: null,
    city: null,
    region: null,
  }
  
  // Buscar localização via IP se solicitado (async)
  if (includeLocation && ip) {
    const location = await getLocationFromIP(ip)
    baseData.country = location.country
    baseData.city = location.city
    baseData.region = location.region
  }
  
  return baseData
}

