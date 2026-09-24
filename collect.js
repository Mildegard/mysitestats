const https = require('https');
const fs = require('fs');
const path = require('path');

// ==================== НАСТРОЙКИ ====================
const DOMAIN = 'ВАШ_ДОМЕН.ru';          // ← замените на свой домен (без http://)
const DATA_FILE = path.join(__dirname, 'data.json');
// ==================================================

function fetchValues(domain) {
  return new Promise((resolve, reject) => {
    const url = `https://counter.yadro.ru/values?site=${encodeURIComponent(domain)}`;

    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
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

async function main() {
  try {
    console.log(`Запрашиваю данные для ${DOMAIN}...`);
    const raw = await fetchValues(DOMAIN);
    const values = parseValues(raw);

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const visitors = values.today_vis ?? values.day_vis ?? 0;
    const hits     = values.today_hit ?? values.day_hit ?? 0;

    let data = {};
    if (fs.existsSync(DATA_FILE)) {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }

    data[today] = {
      date: today,
      visitors,
      hits,
      updated: new Date().toISOString()
    };

    // Сортируем по дате
    const sorted = Object.keys(data).sort().reduce((obj, key) => {
      obj[key] = data[key];
      return obj;
    }, {});

    fs.writeFileSync(DATA_FILE, JSON.stringify(sorted, null, 2), 'utf8');
    console.log(`✓ ${today}: ${visitors} посетителей, ${hits} просмотров`);
  } catch (err) {
    console.error('Ошибка:', err.message);
    process.exit(1);
  }
}

main();
