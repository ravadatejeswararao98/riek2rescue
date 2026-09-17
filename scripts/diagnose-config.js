const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INNER_ENV = path.join(__dirname, '..', '.env');
const OUTER_ENV = path.join(__dirname, '..', '..', '..', '.env');

function hashSecret(val) {
  if (!val) return 'EMPTY';
  const hash = crypto.createHash('sha256').update(val).digest('hex').substring(0, 8);
  return `len:${val.length} sha256:${hash}...`;
}

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const parts = trimmed.split('=');
      env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    }
  });
  return env;
}

const innerEnv = parseEnv(INNER_ENV);
const outerEnv = parseEnv(OUTER_ENV);

// Manually load env since dotenv is not installed
Object.assign(process.env, innerEnv);

const isProbe = process.argv.includes('--probe');

console.log('=== DIAGNOSE CONFIG ===');
console.log(`Loaded .env file: ${INNER_ENV}`);

console.log('\n--- STRANDED CREDENTIALS (In Outer, missing from Inner) ---');
for (const key in outerEnv) {
  if (outerEnv[key] && !innerEnv[key]) {
    console.log(`${key}: ${hashSecret(outerEnv[key])}`);
  }
}

console.log('\n--- SHAPE VALIDATION ---');
const isUUID = (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
const isAlphanumeric = (val) => /^[a-zA-Z0-9_-]+$/.test(val);
const isDataGovInKey = (val) => /^[a-zA-Z0-9_-]{30,}$/.test(val);

const expectedShapes = {
  DATA_GOV_IN_API_KEY: 'alphanumeric',
  DATA_GOV_AP_WIND_SPEED_ID: 'uuid',
  DATA_GOV_AP_TEMPERATURE_ID: 'uuid',
  DATA_GOV_AP_RAINFALL_ID: 'uuid',
  WINDY_DATA_KEY: 'alphanumeric',
  WINDY_MAP_KEY: 'alphanumeric',
  NASA_FIRMS_MAP_KEY: 'alphanumeric',
  RESEND_API_KEY: 'alphanumeric'
};

for (const [key, expected] of Object.entries(expectedShapes)) {
  const val = process.env[key];
  if (!val) {
    console.log(`[MISSING] ${key}`);
    continue;
  }
  
  let valid = false;
  if (expected === 'uuid' && isUUID(val)) valid = true;
  if (expected === 'alphanumeric' && !isUUID(val) && isAlphanumeric(val)) valid = true;
  
  if (!valid) {
    console.log(`[MISMATCH] ${key} - Expected ${expected}. Secret: ${hashSecret(val)}`);
  } else {
    console.log(`[OK] ${key}`);
  }
}

if (isProbe) {
  console.log('\n--- PROBING SOURCES ---');
  // Load source registry and run probes to get actual HTTP status
  const SourceRegistry = require('../source-registry.js');
  
  SourceRegistry.checkAllSources(true).then(health => {
    health.sources.forEach(src => {
      const status = src.status;
      const errorMsg = src.metrics?.lastError || 'None';
      console.log(`${src.sourceId}: ${status} | Error: ${errorMsg}`);
    });
    process.exit(0);
  });
}
