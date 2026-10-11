import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { AiError } from './aiError.js'

// Encrypts AI provider API keys at rest with AES-256-GCM, so a database dump or backup alone does not reveal them.
// The key is stretched from AI_KEYS_SECRET (any string of 24+ characters; `openssl rand -base64 48` is a good one).
// Changing AI_KEYS_SECRET makes saved keys unreadable: an admin then re-enters them.
const SALT = 'ops-kanban/ai-provider-keys/v1'
const MIN_SECRET_LENGTH = 24
let cached: { secret: string; key: Buffer } | undefined

function secretKey(): Buffer | undefined {
  const secret = process.env.AI_KEYS_SECRET?.trim()
  if (!secret || secret.length < MIN_SECRET_LENGTH) return undefined
  if (cached?.secret !== secret) cached = { secret, key: scryptSync(secret, SALT, 32) }
  return cached.key
}

export const canEncrypt = () => !!secretKey()

export function seal(plain: string): string {
  const key = secretKey()
  if (!key) throw new AiError(503, `Set AI_KEYS_SECRET (at least ${MIN_SECRET_LENGTH} characters) on the server before saving API keys.`)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}

export function unseal(sealed: string): string {
  const key = secretKey()
  const [version, iv, tag, data] = sealed.split(':')
  if (!key || version !== 'v1' || !iv || !tag || !data) throw unreadable()
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    throw unreadable()
  }
}

const unreadable = () => new AiError(503, 'The saved AI key cannot be read: AI_KEYS_SECRET is missing or was changed on the server. Re-enter the key in Tools → AI providers.')
