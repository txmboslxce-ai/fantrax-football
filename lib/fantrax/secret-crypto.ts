import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const encodedKey = process.env.FANTRAX_SECRET_ENCRYPTION_KEY;
  if (!encodedKey) {
    throw new Error("FANTRAX_SECRET_ENCRYPTION_KEY is required to encrypt Fantrax Secret IDs.");
  }

  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error("FANTRAX_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }

  return key;
}

export function encryptSecretId(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((part) => part.toString("base64")).join(":");
}

export function decryptSecretId(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error("Stored Fantrax Secret ID is not a valid encrypted value.");
  }

  try {
    const [iv, authTag, encrypted] = parts.map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("FANTRAX_SECRET_ENCRYPTION_KEY")) {
      throw error;
    }

    throw new Error("Unable to decrypt the stored Fantrax Secret ID.");
  }
}
