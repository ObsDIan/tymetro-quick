export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else if (ch === '\r') {
      // ignore CR; LF handles the row ending
    } else {
      field += ch;
    }
  }

  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? '').trim();
    });
    return obj;
  });
}

export async function fetchCsv(path) {
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`無法載入 ${path}：HTTP ${res.status}`);
    return parseCsv(await res.text());
  } catch (err) {
    if (typeof window !== 'undefined' && window.TYMETRO_STATIC_DATA) {
      if (path.includes('stations')) return window.TYMETRO_STATIC_DATA.stations;
      if (path.includes('timetable')) return window.TYMETRO_STATIC_DATA.timetable;
    }
    throw err;
  }
}

export async function fetchJson(path) {
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`無法載入 ${path}：HTTP ${res.status}`);
    return res.json();
  } catch (err) {
    if (typeof window !== 'undefined' && window.TYMETRO_STATIC_DATA?.version) {
      return window.TYMETRO_STATIC_DATA.version;
    }
    throw err;
  }
}

