import crypto from "crypto";

//#####################################################
// Constants
//#####################################################
const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;
const SEPARATOR_CHAR = ".";
const DEFAULT_SECRET = "dRgUjXn2r5u8x/A?D(G+KbPeShVmYq3s";

//#####################################################
// Types
//#####################################################
interface IEncryptConfig {

  // An encryption algorithm to be used.
  algorithm?: string;

  // A 256 bit (32 char) encryption secret.
  secret?: string;
}

//#####################################################
// Functions
//#####################################################
/**
 * This function going to encrypt (encode) a text.
 *
 * @param text - Text to be encrypted.
 * @param config - A set of option configs to control the encryption process.
 */
function encrypt(text: string, config: IEncryptConfig = {}) {
  const secret = config.secret
    || process.env.ENCRYPTION_SECRET
    || DEFAULT_SECRET;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(secret), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  return `${iv.toString("hex")}${SEPARATOR_CHAR}${encrypted.toString("hex")}`;
}

/**
 * This function going to decrypt (decode) a text.
 *
 * @param text - Text to be decrypted.
 * @param config - A set of option configs to control the encryption process.
 */
function decrypt(text: string, config: IEncryptConfig = {}) {
  const secret = config.secret
    || process.env.ENCRYPTION_SECRET
    || DEFAULT_SECRET;

  const [ivStr, textContent] = text.split(SEPARATOR_CHAR);
  const iv = Buffer.from(ivStr, "hex");
  const encryptedText = Buffer.from(textContent, "hex");
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(secret),
    iv,
  );

  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString();
}

//#####################################################
// Exports
//#####################################################
export {
  encrypt,
  decrypt,
};
