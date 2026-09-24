const https = require('https');
const fs = require('fs');
const path = require('path');

const DOMAINS = ['spacefantasy.ru', 'giftscomic.com'];
const DATA_FILE = path.join(__dirname, 'data.json');

function fetchValues(domain) {
  return new Promise((resolve, reject) => {
    https.get(
      'https://counter.yadro.ru/values?site=' + encodeURIComponent(domain),
      { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      }
    ).on('error', reject);
  });
}

function parseValues(text) {
  const result = {};
  const re = /LI_(\w+)\s*=\s*['"]?([^;'"\s]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    result[m[1]] = /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : m[2];
  }
  return result;
}

async function main() {
  console.log('Сбор:', DOMAINS.join(', '));

  let data = {};
  if (fs.existsSync(DATA_FILE)) {
    try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) {}
  }

  // Старый формат (даты на верхнем уровне) → переносим в spacefantasy.ru
  const keys = Object.keys(data);
  if (keys.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(keys[0])) {
    console.log('Конвертация старого формата...');
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

      data[domain][today] = {
        date: today,
        visitors,
        hits,
        updated: new Date().toISOString()
      };
      console.log('OK', domain, visitors, 'visitors,', hits, 'hits');
    } catch (e) {
      console.error('Ошибка', domain, e.message);
    }
  }

  // Сортировка
  for (const d of Object.keys(data)) {
    const sorted = {};
    Object.keys(data[d]).sort().forEach(k => sorted[k] = data[d][k]);
    data[d] = sorted;
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log('Готово');
}

main().catch(e => { console.error(e); process.exit(1); });
