const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000';
const API_KEY = process.env.API_KEY || 'vol_p2P1HPR0qc9Plwg8WDMhpRJtvsZh_m_IXESHfsLjPZU';
const APP_ID = process.env.APP_ID ? Number(process.env.APP_ID) : 2;

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    ...extra,
  };
}

function url(path) {
  return `${BASE_URL}${path}`;
}

async function request(method, path, body = undefined) {
  const opts = { method, headers: headers() };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url(path), opts);
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }
  return { status: res.status, statusText: res.statusText, headers: res.headers, data };
}

module.exports = { BASE_URL, API_KEY, APP_ID, headers, url, request };
