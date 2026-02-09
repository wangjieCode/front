import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');

  if (!salt || !hash) {
    return false;
  }

  const hashedBuffer = Buffer.from(hash, 'hex');
  const candidateBuffer = scryptSync(password, salt, KEY_LENGTH);

  if (hashedBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return timingSafeEqual(hashedBuffer, candidateBuffer);
}
