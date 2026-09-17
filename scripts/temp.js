const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  if (line.includes('=')) acc[line.split('=')[0].trim()] = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  return acc;
}, {});
Object.assign(process.env, env);

const SourceRegistry = require('../source-registry.js');
SourceRegistry.checkAllSources(true).then(h => {
  console.log(JSON.stringify(h.sources.filter(s => s.status !== 'LIVE' && s.status !== 'BASELINE' && s.status !== 'NOT_CONFIGURED'), null, 2))
});
