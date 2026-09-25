const https = require('https');
const fs = require('fs');
const path = require('path');

const DOMAINS = ['spacefantasy.ru', 'giftscomic.com'];
const DATA_FILE = path.join(__dirname, 'data.json');

function fetchValues(domain) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      'https://counter.yadro.ru/values?site=' + encodeURIComponent(domain),
      { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
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

/** Вчерашняя дата YYYY-MM-DD по Москве */
function moscowYesterday() {
  const todayMoscow = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
  const [y, m, d] = todayMoscow.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

async function main() {
  console.log('=== Сбор LiveInternet ===');
  console.log('Домены:', DOMAINS.join(', '));

  let data = {};
  if (fs.existsSync(DATA_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.warn('data.json битый, начинаем с нуля');
      data = {};
    }
  }

  // Старый плоский формат → перенос под spacefantasy.ru (один раз)
  const topKeys = Object.keys(data);
  if (topKeys.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(topKeys[0])) {
    console.log('Конвертация старого формата...');
    data = { 'spacefantasy.ru': data };
  }

  const recordDate = moscowYesterday();
  console.log('Записываем закрытый день:', recordDate);

  for (const domain of DOMAINS) {
    // ВАЖНО: не затираем объект домена — только дополняем/обновляем одну дату
    if (!data[domain] || typeof data[domain] !== 'object') {
      data[domain] = {};
    }

    try {
      const raw = await fetchValues(domain);
      const v = parseValues(raw);

      // Закрытые сутки (day_*), иначе fallback на today_*
      const visitors = (v.day_vis > 0) ? v.day_vis : (v.today_vis || 0);
      const hits     = (v.day_hit > 0) ? v.day_hit : (v.today_hit || 0);

      data[domain][recordDate] = {
        date: recordDate,
        visitors,
        hits,
        updated: new Date().toISOString()
      };

      const daysCount = Object.keys(data[domain]).length;
      console.log('OK', domain, '→', visitors, 'visitors,', hits, 'hits', '| дней в базе:', daysCount);
    } catch (e) {
      console.error('Ошибка', domain, e.message);
      // не трогаем уже сохранённые дни при ошибке одного домена
    }
  }

  // Сортировка дат внутри каждого домена (старые ключи сохраняются)
  for (const d of Object.keys(data)) {
    if (typeof data[d] !== 'object') continue;
    const sorted = {};
    Object.keys(data[d]).sort().forEach(k => { sorted[k] = data[d][k]; });
    data[d] = sorted;
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log('=== Готово ===');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
