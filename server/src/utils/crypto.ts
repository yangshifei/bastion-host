import crypto from 'crypto';
import config from '../config';

const ALGORITHM = 'aes-256-cbc';

// Key must be exactly 32 bytes
function getKey(): Buffer {
  const secret = config.encryption.secret;
  const key = Buffer.from(secret, 'hex');
  if (key.length !== 32) {
    // If not valid hex 32 bytes, use SHA-256 hash
    return crypto.createHash('sha256').update(secret).digest();
  }
  return key;
}

/**
 * Encrypt plaintext using AES-256-CBC.
 * Returns a string in format "iv:encrypted" (both hex-encoded).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt ciphertext in format "iv:encrypted".
 * Returns the original plaintext string.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();

  const parts = ciphertext.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid ciphertext format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
