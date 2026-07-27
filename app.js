import { fetchCsv, fetchJson } from './src/csv.js';
import {
  buildContext,
  durationText,
  formatMinutes,
  getFirstDeparture,
  planRoutes,
  serviceTypeForDate,
  stationDisplay,
} from './src/router.js';

const els = {
  origin: document.querySelector('#originSelect'),
  destination: document.querySelector('#destinationSelect'),
  time: document.querySelector('#timeInput'),
  date: document.querySelector('#dateInput'),
  search: document.querySelector('#searchBtn'),
  now: document.querySelector('#nowBtn'),
  swap: document.querySelector('#swapBtn'),
  results: document.querySelector('#results'),
  decision: document.querySelector('#decision'),
  dataBanner: document.querySelector('#dataBanner'),
  versionText: document.querySelector('#versionText'),
  work: document.querySelector('#workBtn'),
  home: document.querySelector('#homeBtn'),
  saveWork: document.querySelector('#saveWorkBtn'),
  saveHome: document.querySelector('#saveHomeBtn'),
  install: document.querySelector('#installBtn'),
};

let context = null;
let version = null;
let deferredInstallPrompt = null;

function todayString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nowTimeString(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function showBanner(message, { error = false } = {}) {
  els.dataBanner.textContent = message;
  els.dataBanner.classList.remove('hidden', 'error');
  if (error) els.dataBanner.classList.add('error');
}

function hideBanner() {
  els.dataBanner.classList.add('hidden');
  els.dataBanner.textContent = '';
}

function populateStationSelects() {
  const options = context.stations.map((station) => {
    const option = document.createElement('option');
    option.value = station.station_id;
    option.textContent = stationDisplay(station);
    return option;
  });
  els.origin.replaceChildren(...options.map((o) => o.cloneNode(true)));
  els.destination.replaceChildren(...options.map((o) => o.cloneNode(true)));

  const saved = JSON.parse(localStorage.getItem('tymetro:lastRoute') || 'null');
  els.origin.value = saved?.originId || 'A1';
  els.destination.value = saved?.destinationId || 'A13';
  if (els.origin.value === els.destination.value) els.destination.value = 'A8';
}

function routeParams() {
  return {
    originId: els.origin.value,
    destinationId: els.destination.value,
    time: els.time.value,
    date: new Date(`${els.date.value || todayString()}T00:00:00`),
    limit: 5,
  };
}

function saveLastRoute() {
  localStorage.setItem('tymetro:lastRoute', JSON.stringify({
    originId: els.origin.value,
    destinationId: els.destination.value,
  }));
}

function setRoute(route) {
  if (!route) return;
  els.origin.value = route.originId;
  els.destination.value = route.destinationId;
  search();
}

function saveNamedRoute(key) {
  localStorage.setItem(`tymetro:${key}`, JSON.stringify({
    originId: els.origin.value,
    destinationId: els.destination.value,
  }));
  showBanner(key === 'workRoute' ? '已存為上班路線。' : '已存為下班路線。');
  setTimeout(() => {
    if (!version?.is_demo) hideBanner();
  }, 1600);
}

function loadNamedRoute(key) {
  const route = JSON.parse(localStorage.getItem(`tymetro:${key}`) || 'null');
  if (!route) {
    showBanner(key === 'workRoute' ? '尚未設定上班路線。請先選好站點後按「存為上班」。' : '尚未設定下班路線。請先選好站點後按「存為下班」。');
    return;
  }
  setRoute(route);
}

function renderDecision(result, firstDeparture) {
  const best = result.routes[0];
  if (!best) {
    els.decision.classList.add('hidden');
    return;
  }

  let answer = `搭 ${formatTrainType(best.legs[0].trainType)}`;
  let detail = `最快 ${formatMinutes(best.departure)} 出發，${formatMinutes(best.arrival)} 抵達，共 ${durationText(best.duration)}。`;

  if (firstDeparture) {
    const sameFirstTrain = best.legs[0].trainId === firstDeparture.trainId;
    if (firstDeparture.trainType === 'local') {
      answer = sameFirstTrain ? '普通車先來：上車' : `普通車先來：先不要上`;
      detail = sameFirstTrain
        ? `最快方案就是先搭這班普通車，再依結果轉乘。${formatMinutes(best.arrival)} 抵達。`
        : `最快方案建議等 ${formatMinutes(best.departure)} 的 ${formatTrainType(best.legs[0].trainType)}，${formatMinutes(best.arrival)} 抵達。`;
    } else if (firstDeparture.trainType === 'express') {
      answer = sameFirstTrain ? '直達車先來：上車' : '直達車先來：再確認';
      detail = sameFirstTrain
        ? `最快方案就是先搭這班直達車。${formatMinutes(best.arrival)} 抵達。`
        : `最快方案不是第一班車，而是 ${formatMinutes(best.departure)} 的 ${formatTrainType(best.legs[0].trainType)}。`;
    }
  }

  els.decision.innerHTML = `
    <div class="answer">${escapeHtml(answer)}</div>
    <p>${escapeHtml(detail)}</p>
  `;
  els.decision.classList.remove('hidden');
}

function renderResults(result) {
  if (result.routes.length === 0) {
    els.results.innerHTML = '<div class="empty">查不到可行班次。可能已超過末班車、資料尚未匯入完整，或該日期服務型態沒有資料。</div>';
    return;
  }

  const bestArrival = result.routes[0].arrival;
  const queryMinute = result.queryMinute;
  els.results.innerHTML = result.routes.map((route, idx) => renderRoute(route, idx, bestArrival, queryMinute)).join('');
}

function renderRoute(route, index, bestArrival, queryMinute) {
  const slower = route.arrival - bestArrival;
  const diff = index === 0 ? '🏆 最快抵達' : `⏱️ 慢 ${durationText(slower)}`;
  const countdownMin = route.departure - queryMinute;
  let countdownLabel = '';
  if (countdownMin >= 0 && countdownMin <= 120) {
    countdownLabel = countdownMin === 0 ? '🟢 班車進站中/即將發車' : `⚡ 離發車剩 ${countdownMin} 分鐘`;
  }

  const tipsHtml = (route.tips || []).map((t) => `<div class="hint tip-badge">💡 ${escapeHtml(t)}</div>`).join('');

  return `
    <article class="route-card ${index === 0 ? 'best' : ''}">
      <div class="route-top">
        <h3>${index + 1}. ${escapeHtml(route.typeLabel)}</h3>
        <span class="badge ${index === 0 ? '' : 'slower'}">${diff}</span>
      </div>

      ${countdownLabel ? `<div class="countdown-bar">${countdownLabel}</div>` : ''}

      <div class="metrics">
        <div class="metric"><span>出發</span><strong>${formatMinutes(route.departure)}</strong></div>
        <div class="metric"><span>抵達</span><strong>${formatMinutes(route.arrival)}</strong></div>
        <div class="metric"><span>總時間</span><strong>${durationText(route.duration)}</strong></div>
        <div class="metric"><span>單程全票</span><strong>NT$ ${route.fare}</strong></div>
      </div>

      ${route.transferCount ? `<p class="hint">🔄 轉乘站：<strong>${escapeHtml(route.transferStationName)}</strong>（等待 ${durationText(route.transferWait)}）</p>` : '<p class="hint">直達目的地，無須轉乘。</p>'}
      ${tipsHtml}

      <div class="timeline">${renderTimeline(route)}</div>
    </article>
  `;
}


function renderTimeline(route) {
  const parts = [];
  route.legs.forEach((leg, idx) => {
    const isExpress = leg.trainType === 'express';
    const tagClass = isExpress ? 'express' : 'local';
    const tagLabel = isExpress ? '直達車' : '普通車';

    parts.push(`
      <div class="step">
        <div class="step-time">${formatMinutes(leg.departure)}</div>
        <div class="step-content">
          <div class="step-title">${escapeHtml(leg.originName)}</div>
          <div class="step-subtitle"><span class="train-tag ${tagClass}">${tagLabel}</span> 班次 ${escapeHtml(leg.trainId)}</div>
        </div>
      </div>
    `);
    parts.push(`
      <div class="step">
        <div class="step-time">${formatMinutes(leg.arrival)}</div>
        <div class="step-content">
          <div class="step-title">${escapeHtml(leg.destinationName)}</div>
          <div class="step-subtitle">${idx === route.legs.length - 1 ? '🏁 抵達目的地' : '🔄 下車轉乘'}</div>
        </div>
      </div>
    `);
    if (idx < route.legs.length - 1) {
      parts.push(`<div class="transfer-note">⏳ 同站轉乘等待 ${durationText(route.legs[idx + 1].departure - leg.arrival)}</div>`);
    }
  });
  return parts.join('');
}


function formatTrainType(type) {
  return type === 'local' ? '普通車' : type === 'express' ? '直達車' : type;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function search() {
  if (!context) return;
  if (!els.time.value) els.time.value = nowTimeString();
  if (!els.date.value) els.date.value = todayString();

  saveLastRoute();
  const params = routeParams();
  try {
    const result = planRoutes(context, params);
    const firstDeparture = getFirstDeparture(context, params);
    renderDecision(result, firstDeparture);
    renderResults(result);
  } catch (error) {
    els.decision.classList.add('hidden');
    els.results.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

async function init() {
  els.time.value = nowTimeString();
  els.date.value = todayString();
  try {
    const [stations, timetable, metadata] = await Promise.all([
      fetchCsv('data/stations.csv'),
      fetchCsv('data/timetable.csv'),
      fetchJson('data/version.json').catch(() => ({})),
    ]);
    version = metadata;
    context = buildContext(stations, timetable);
    populateStationSelects();
    renderVersion(metadata, timetable.length);
    if (metadata.is_demo) {
      showBanner('目前載入的是示範班表，不可作為實際通勤依據。請先用官方資料轉換並替換 data/timetable.csv。');
    }
    search();
  } catch (error) {
    showBanner(error.message, { error: true });
    els.versionText.textContent = '資料載入失敗';
  }
}

function renderVersion(metadata, rowCount) {
  const demo = metadata.is_demo ? '示範資料' : 'XML 轉換資料';
  const valid = metadata.valid_until ? `，適用至 ${metadata.valid_until}` : '';
  const sourceTime = metadata.source_update_time ? `，來源 ${metadata.source_update_time.slice(0, 10)}` : '';
  els.versionText.textContent = `班表：${metadata.data_version ?? '未標示'}（${demo}，${rowCount.toLocaleString()} 筆${sourceTime}）${valid}`;
}

els.search.addEventListener('click', search);
els.now.addEventListener('click', () => { els.time.value = nowTimeString(); els.date.value = todayString(); search(); });
els.swap.addEventListener('click', () => {
  const temp = els.origin.value;
  els.origin.value = els.destination.value;
  els.destination.value = temp;
  search();
});

document.querySelector('#originChips')?.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const originId = chip.dataset.origin;
  if (originId && els.origin) {
    els.origin.value = originId;
    if (els.origin.value === els.destination.value) {
      els.destination.value = originId === 'A1' ? 'A13' : 'A1';
    }
    search();
  }
});
els.origin.addEventListener('change', search);
els.destination.addEventListener('change', search);
els.time.addEventListener('change', search);
els.date.addEventListener('change', search);
els.work.addEventListener('click', () => loadNamedRoute('workRoute'));
els.home.addEventListener('click', () => loadNamedRoute('homeRoute'));
els.saveWork.addEventListener('click', () => saveNamedRoute('workRoute'));
els.saveHome.addEventListener('click', () => saveNamedRoute('homeRoute'));

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  els.install.classList.remove('hidden');
});
els.install.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  els.install.classList.add('hidden');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => undefined);
  });
}

init();
