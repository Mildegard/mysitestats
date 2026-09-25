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

/** Дата YYYY-MM-DD по Москве */
function moscowDate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
}

async function main() {
  console.log('Сбор:', DOMAINS.join(', '));

  let data = {};
  if (fs.existsSync(DATA_FILE)) {
    try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) {}
  }

  // Старый плоский формат → spacefantasy.ru
  const keys = Object.keys(data);
  if (keys.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(keys[0])) {
    console.log('Конвертация старого формата...');
    data = { 'spacefantasy.ru': data };
  }

  // Берём ЗАКРЫТЫЙ день (LI_day_*) — полный вчерашний день
  // Дата записи = вчера по Москве
  const recordDate = moscowDate(-1);

  for (const domain of DOMAINS) {
    if (!data[domain]) data[domain] = {};
    try {
      const raw = await fetchValues(domain);
      const v = parseValues(raw);

      // day_* = полный вчерашний день (надёжно)
      const visitors = (v.day_vis > 0 ? v.day_vis : (v.today_vis || 0));
      const hits     = (v.day_hit > 0 ? v.day_hit : (v.today_hit || 0));

      data[domain][recordDate] = {
        date: recordDate,
        visitors,
        hits,
        updated: new Date().toISOString()
      };
      console.log('OK', domain, recordDate, '->', visitors, 'visitors,', hits, 'hits');
    } catch (e) {
      console.error('Ошибка', domain, e.message);
    }
  }

  for (const d of Object.keys(data)) {
    const sorted = {};
    Object.keys(data[d]).sort().forEach(k => { sorted[k] = data[d][k]; });
    data[d] = sorted;
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log('Готово. Дата записи (Москва, вчера):', recordDate);
}

main().catch(e => { console.error(e); process.exit(1); });
