const https = require('https');
const fs = require('fs');
const path = require('path');

// ==================== НАСТРОЙКИ ====================
const DOMAINS = [
  'spacefantasy.ru',
  'giftscomic.com'
];
// ==================================================

const DATA_FILE = path.join(__dirname, 'data.json');

function fetchValues(domain) {
  return new Promise((resolve, reject) => {
    const url = `https://counter.yadro.ru/values?site=${encodeURIComponent(domain)}`;
    console.log('Запрос:', url);

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} для ${domain}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Таймаут для ${domain}`));
    });
  });
}

function parseValues(text) {
  const result = {};
  const regex = /LI_(\w+)\s*=\s*['"]?([^;'"\s]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const key = match[1];
    const val = match[2];
    result[key] = /^\d+$/.test(val) ? parseInt(val, 10) : val;
  }
  return result;
}

async function collectOne(domain) {
  const raw = await fetchValues(domain);
  const values = parseValues(raw);

  if (values.error) {
    console.warn(`⚠ ${domain}: ${values.error}`);
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const visitors = values.today_vis ?? values.day_vis ?? 0;
  const hits     = values.today_hit ?? values.day_hit ?? 0;

  console.log(`✓ ${domain}: ${visitors} посетителей, ${hits} просмотров`);

  return {
    date: today,
    visitors,
    hits,
    updated: new Date().toISOString()
  };
}

async function main() {
  console.log('=== Сбор статистики LiveInternet ===');
  console.log('Домены:', DOMAINS.join(', '));
  console.log('');

  let data = {};
  if (fs.existsSync(DATA_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.warn('Не удалось прочитать data.json, создаём заново');
      data = {};
    }
  }

  // Поддержка старого формата (плоский объект по датам)
  // Если это старый формат — переносим в spacefantasy.ru
  const keys = Object.keys(data);
  if (keys.length > 0 && keys[0].match(/^\d{4}-\d{2}-\d{2}$/)) {
    console.log('Обнаружен старый формат data.json — конвертируем...');
    data = { 'spacefantasy.ru': data };
  }

  for (const domain of DOMAINS) {
    if (!data[domain]) data[domain] = {};

    try {
      const entry = await collectOne(domain);
      if (entry) {
        data[domain][entry.date] = entry;
      }
    } catch (err) {
      console.error(`Ошибка для ${domain}:`, err.message);
    }
  }

  // Сортируем даты внутри каждого домена
  for (const domain of Object.keys(data)) {
    const sorted = Object.keys(data[domain]).sort().reduce((obj, key) => {
      obj[key] = data[domain][key];
      return obj;
    }, {});
    data[domain] = sorted;
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log('');
  console.log('=== Готово ===');
}

main().catch(err => {
  console.error('Критическая ошибка:', err.message);
  process.exit(1);
});
