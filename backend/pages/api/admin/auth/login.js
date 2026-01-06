import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import { applyCors } from '../../../../utils/cors'
import {
  extractIp,
  setSecurityHeaders,
  sanitizeString,
  sanitizeError,
  rateLimit,
} from '../../../../utils/security'
import { sendAdminNotification } from '../../../../utils/discord'

// Carregar .env manualmente para evitar problemas com $ no Next.js
const loadEnvVar = (key) => {
  try {
    const envPath = path.join(process.cwd(), '.env')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8')
      const lines = envContent.split('\n')
      const line = lines.find(l => l.trim().startsWith(`${key}=`))
      if (line) {
        const match = line.match(new RegExp(`${key}=(.+)`))
        if (match) {
          let value = match[1].trim()
          // Remover aspas se existirem
          value = value.replace(/^["']|["']$/g, '')
          return value
        }
      }
    }
  } catch (e) {
    console.error('[Env] Erro ao carregar .env:', e)
  }
  return process.env[key]
}

// Rate limiter muito restritivo para login
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  maxRequests: 5, // Apenas 5 tentativas por 15 minutos
})

// Credenciais do admin (hash da senha gerado com bcrypt)
// Carregar diretamente do .env para evitar problema com $ no Next.js
const ADMIN_EMAIL = loadEnvVar('ADMIN_EMAIL') || process.env.ADMIN_EMAIL
const ADMIN_PASSWORD_HASH = loadEnvVar('ADMIN_PASSWORD_HASH') || process.env.ADMIN_PASSWORD_HASH
const JWT_SECRET = loadEnvVar('JWT_SECRET') || process.env.JWT_SECRET

// Validação crítica: não permitir funcionamento sem variáveis de ambiente configuradas
const validateEnvVars = () => {
  const missing = []
  if (!ADMIN_EMAIL) missing.push('ADMIN_EMAIL')
  if (!ADMIN_PASSWORD_HASH) missing.push('ADMIN_PASSWORD_HASH')
  if (!JWT_SECRET) missing.push('JWT_SECRET')
  
  if (missing.length > 0) {
    throw new Error(`[SECURITY] Variáveis de ambiente obrigatórias não configuradas: ${missing.join(', ')}`)
  }
}

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

export default async function handler(req, res) {
  setSecurityHeaders(req, res)
  
  if (applyCors(req, res)) {
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Validar variáveis de ambiente antes de processar
  try {
    validateEnvVars()
  } catch (envError) {
    console.error(envError.message)
    return res.status(500).json({ error: 'Erro de configuração do servidor' })
  }

  // Rate limiting
  if (loginRateLimit(req, res)) {
    return
  }

  const ip = extractIp(req)

  try {
    const sanitizedBody = {
      email: sanitizeString(req.body?.email || '', 100).toLowerCase(),
      password: req.body?.password || '',
    }

    const { email, password } = loginSchema.parse(sanitizedBody)

    // Verificar email
    if (email !== ADMIN_EMAIL.toLowerCase()) {
      console.warn('[Admin Auth] Tentativa de login com email inválido:', { email, ip })
      
      // Notificar tentativa
      sendAdminNotification({
        type: 'unauthorized_access',
        email,
        provider: 'credentials',
        name: 'Desconhecido',
      }).catch(() => {})

      // Delay para dificultar brute force
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }

    // Verificar senha
    const passwordValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH)
    
    if (!passwordValid) {
      console.warn('[Admin Auth] Tentativa de login com senha inválida:', { email, ip })
      
      // Notificar tentativa
      sendAdminNotification({
        type: 'unauthorized_access',
        email,
        provider: 'credentials',
        name: 'Senha incorreta',
      }).catch(() => {})

      // Delay para dificultar brute force
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }

    // Gerar JWT
    const token = jwt.sign(
      { 
        email,
        role: 'admin',
        iat: Math.floor(Date.now() / 1000),
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    console.info('[Admin Auth] Login bem-sucedido:', { email, ip })

    // Notificar login
    sendAdminNotification({
      type: 'admin_login',
      email,
      provider: 'credentials',
      name: 'Admin',
    }).catch(() => {})

    return res.status(200).json({
      success: true,
      token,
      user: {
        email,
        role: 'admin',
      },
    })
  } catch (error) {
    console.error('[Admin Auth] Erro no login:', error)

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Dados inválidos',
        issues: error.issues.map(i => ({
          path: i.path,
          message: i.message,
        })),
      })
    }

    const errorResponse = sanitizeError(error, process.env.NODE_ENV === 'production')
    return res.status(500).json(errorResponse)
  }
}

