import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Encrypts and authenticates small JSON values for cookies (AES-256-GCM). */
export function createSealer(secret: string) {
  const key = createHash('sha256').update(secret).digest();

  return {
    seal(value: unknown): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
    },

    /** Returns null for anything tampered with, malformed or sealed with another secret. */
    unseal<T>(sealed: string | undefined): T | null {
      if (!sealed) return null;
      try {
        const data = Buffer.from(sealed, 'base64url');
        const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
        decipher.setAuthTag(data.subarray(12, 28));
        const decrypted = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8')) as T;
      } catch {
        return null;
      }
    },
  };
}
