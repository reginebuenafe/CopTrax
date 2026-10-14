// Used only by Supplier Registration and its endpoints; other forms keep their policies.
export const REGISTRATION_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/jpg,image/png,image/heic,image/heif";
export const IMAGE_FORMAT_ERROR = "Only JPEG, PNG, and HEIC files are accepted.";
export const REGISTRATION_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const PASSWORD_RULE = "Use at least 8 characters. Avoid common passwords and repeated or sequential digits.";
export const PASSWORD_ERROR = "Password must be at least 8 characters and must not be a common weak password or repeated or sequential digits.";

const MIME_FORMATS = {
  "image/jpeg": "jpeg", "image/jpg": "jpeg", "image/png": "png",
  "image/heic": "heic", "image/heif": "heic",
};
const EXTENSION_FORMATS = { jpg: "jpeg", jpeg: "jpeg", png: "png", heic: "heic", heif: "heic" };
const COMMON_PASSWORDS = new Set([
  "123123", "12345678", "password", "password1", "password123", "qwerty",
  "qwerty123", "abc123", "abc12345", "letmein", "welcome", "admin", "iloveyou",
]);

export function emailError(value) {
  if (typeof value !== "string") return "Please enter a valid email address.";
  const email = value.trim();
  // One @, valid unquoted local-part characters, dot-separated domain labels,
  // and an alphabetic ending. Dots cannot start/end or repeat in the local part.
  return email.length <= 254 && email.split("@")[0].length <= 64 &&
    /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(email)
    ? "" : "Please enter a valid email address.";
}

export function passwordError(value) {
  if (typeof value !== "string" || value.length < 8) return PASSWORD_ERROR;
  const normalized = value.toLowerCase();
  const digits = /^\d+$/.test(value);
  const repeated = /^(\d{1,4})\1+$/.test(value);
  const sequential = digits && ([1, 9].some(step => [...value].slice(1).every((digit, index) =>
    Number(digit) === (Number(value[index]) + step) % 10)));
  return COMMON_PASSWORDS.has(normalized) || repeated || sequential ? PASSWORD_ERROR : "";
}

export function imageFormat(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) return "png";
  const text = (offset, length) => String.fromCharCode(...bytes.slice(offset, offset + length));
  if (bytes.length >= 16 && text(4, 4) === "ftyp") {
    const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    const brands = [text(8, 4)];
    for (let i = 16; i + 4 <= Math.min(boxSize, bytes.length); i += 4) brands.push(text(i, 4));
    // Require a HEVC image brand; generic mif1 alone also occurs in AVIF files.
    if (brands.some(brand => ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"].includes(brand))) return "heic";
  }
  return "";
}

export function validateImageBytes(name, mime, bytes, size = bytes.length) {
  const extension = typeof name === "string" ? name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() : "";
  const expected = EXTENSION_FORMATS[extension];
  const declared = typeof mime === "string" ? mime.toLowerCase() : "";
  if (!expected || (declared && MIME_FORMATS[declared] !== expected) || imageFormat(bytes) !== expected) {
    return IMAGE_FORMAT_ERROR;
  }
  return size > REGISTRATION_MAX_FILE_SIZE ? "The image must be 10 MB or smaller." : "";
}

export async function validateImageFile(file) {
  if (!file) return IMAGE_FORMAT_ERROR;
  try {
    return validateImageBytes(file.name, file.type, new Uint8Array(await file.slice(0, 512).arrayBuffer()), file.size);
  } catch {
    return "The image could not be read. Please choose it again.";
  }
}

export function validateImageDataUrl(dataUrl, name, originalMime) {
  const match = typeof dataUrl === "string" && dataUrl.match(/^data:([^;,]*);base64,([a-z0-9+/]*={0,2})$/i);
  if (!match) throw new Error(IMAGE_FORMAT_ERROR);
  // The browser may use an empty MIME type or application/octet-stream for HEIC.
  const declared = match[1].toLowerCase();
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const error = validateImageBytes(name, originalMime ?? "", bytes);
  const format = imageFormat(bytes);
  if (error || (declared && declared !== "application/octet-stream" && MIME_FORMATS[declared] !== format)) {
    throw new Error(error || IMAGE_FORMAT_ERROR);
  }
  return { bytes, mimeType: `image/${format}`, extension: format === "jpeg" ? "jpg" : format };
}
