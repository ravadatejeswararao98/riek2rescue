/**
 * RISK2RESCUE - REDACTION ENGINE (js/redact.js)
 * Safely scrubs API keys, bearer tokens, and secrets from error messages and logs.
 */

function safeText(text) {
  if (typeof text !== 'string') return text;

  let scrubbed = text;

  // 1. Scrub Known Patterns
  // Bearer tokens
  scrubbed = scrubbed.replace(/Bearer\s+[A-Za-z0-9\-_]+/gi, 'Bearer ***');
  
  // Resend API Keys (re_...)
  scrubbed = scrubbed.replace(/re_[a-zA-Z0-9]{20,}/g, 're_***');
  
  // SendGrid API Keys (SG....)
  scrubbed = scrubbed.replace(/SG\.[a-zA-Z0-9\-_]{20,}/g, 'SG.***');
  
  // Google API Keys (AIza...)
  scrubbed = scrubbed.replace(/AIza[a-zA-Z0-9\-_]{20,}/g, 'AIza***');

  // Windy API Keys (heuristics for 30+ char alphanumeric)
  // But live scan is safer for these. Let's rely on live scan for custom keys.

  // 2. Live Environment Scan
  // Scan process.env and redact any exact match of a configured value.
  // We only redact values longer than 5 characters to avoid accidentally redacting common small strings or numbers.
  for (const [key, value] of Object.entries(process.env)) {
    if (value && typeof value === 'string' && value.length > 5) {
      // Escape special regex characters in the secret value before matching
      const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedValue, 'g');
      scrubbed = scrubbed.replace(regex, '***');
    }
  }

  return scrubbed;
}

function safeObject(obj) {
  if (typeof obj === 'string') return safeText(obj);
  if (Array.isArray(obj)) return obj.map(safeObject);
  if (obj && typeof obj === 'object') {
    const scrubbed = {};
    for (const [k, v] of Object.entries(obj)) {
      scrubbed[k] = safeObject(v);
    }
    return scrubbed;
  }
  return obj;
}

module.exports = {
  safeText,
  safeObject
};
