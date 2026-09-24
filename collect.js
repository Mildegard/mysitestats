const https = require('https');
const fs = require('fs');
const path = require('path');

const DOMAINS = ['spacefantasy.ru', 'giftscomic.com'];
const DATA_FILE = path.join(__dirname, 'data.json');

function fetchValues(domain) {
  return new Promise((resolve, reject) => {
    const url = `https://counter.yadro.ru/values?site=${encodeURIComponent(domain)}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseValues(text) {
  const result = {};
  const regex = /LI_(\w+)\s*=\s*['"]?([^;'"\s]+)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    result[m[1]] = /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : m[2];
  }
  return result;
}

async function main() {
  console.log('Сбор для:', DOMAINS.join(', '));
  let data = {};
  if (fs.existsSync(DATA_FILE)) {
    try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e) {}
  }

  // Конвертация старого формата
  const keys = Object.keys(data);
  if (keys.length && keys[0].match(/^\d{4}-\d{2}-\d{2}$/)) {
    data = { 'spacefantasy.ru': data };
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const domain of DOMAINS) {
    if (!data[domain]) data[domain] = {};
    try {
      const raw = await fetchValues(domain);
      const v = parseValues(raw);
      const visitors = v.today_vis ?? v.day_vis ?? 0;
      const hits = v.today_hit ?? v.day_hit ?? 0;
      data[domain][today] = { date: today, visitors, hits, updated: new Date().toISOString() };
      console.log(`✓ ${domain}: ${visitors} посетителей, ${hits} просмотров`);
    } catch (e) {
      console.error(`Ошибка ${domain}:`, e.message);
    }
  }

  for (const d of Object.keys(data)) {
    data[d] = Object.keys(data[d]).sort().reduce((o, k) => (o[k] = data[d][k], o), {});
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log('Готово');
}

main().catch(e => { console.error(e); process.exit(1); });
