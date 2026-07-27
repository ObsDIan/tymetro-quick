const TRANSFER_BUFFER_MINUTES = 1;
const SEARCH_WINDOW_MINUTES = 210;
const AFTER_MIDNIGHT_CUTOFF = 4 * 60;

export function parseClockToMinutes(value) {
  if (typeof value !== 'string') throw new Error('時間格式錯誤');
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`時間格式錯誤：${value}`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 27 || m < 0 || m > 59) {
    throw new Error(`時間超出範圍：${value}`);
  }
  return h * 60 + m;
}

export function formatMinutes(total) {
  const normalized = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function durationText(minutes) {
  if (!Number.isFinite(minutes)) return '--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m} 分`;
  return `${h} 小時 ${m} 分`;
}

export function normalizeServiceMinute(minute) {
  return minute < AFTER_MIDNIGHT_CUTOFF ? minute + 1440 : minute;
}

export function normalizeDirection(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (['south', 's', '0', 'down', 'outbound', '去程', '往機場', '往中壢', '往老街溪', '往環北'].includes(v)) return 'south';
  if (['north', 'n', '1', 'up', 'inbound', '返程', '往台北', '往台北車站'].includes(v)) return 'north';
  return v || 'unknown';
}

export function normalizeTrainType(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (['local', '普通', '普通車', '一般', '一般-普通車', '1'].includes(v)) return 'local';
  if (['express', '直達', '直達車', '快速', '跳站', '2'].includes(v)) return 'express';
  return v || 'unknown';
}

export function normalizeServiceType(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (['weekday', 'workday', '平日', '工作日', '1'].includes(v)) return 'weekday';
  if (['weekend', 'holiday', '假日', '週末', '周末', '0'].includes(v)) return 'weekend';
  if (['daily', 'all', '每日', '每天', ''].includes(v)) return 'daily';
  return v;
}

export function serviceTypeForDate(date) {
  const day = date.getDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

export function calculateFare(originId, destinationId, context) {
  if (!context?.stationsById) return 30;
  const o = context.stationsById.get(originId);
  const d = context.stationsById.get(destinationId);
  if (!o || !d) return 30;
  const seqDiff = Math.abs(o.seq - d.seq);
  if (seqDiff === 0) return 0;
  if (seqDiff <= 1) return 30;
  if (seqDiff <= 3) return 35;
  if (seqDiff <= 5) return 60;
  if (seqDiff <= 8) return 90;
  if (seqDiff <= 11) return 130;
  if (seqDiff <= 13) return 150;
  return 160;
}

export function getRouteTips(route, context) {
  const tips = [];
  if (!route?.legs?.length) return tips;
  const originId = route.legs[0].originId;
  const destId = route.legs[route.legs.length - 1].destinationId;
  const transferId = route.transferStationId;

  if (transferId === 'A8') {
    tips.push('長庚醫院站 (A8) 支援同月台快速轉乘直達/普通車');
  } else if (transferId === 'A3') {
    tips.push('新北產業園區站 (A3) 提供預辦登機服務');
  }

  if (originId === 'A1' || destId === 'A1') {
    tips.push('A1 台北車站提供市區預辦登機與行李託運');
  }
  if (['A12', 'A13', 'A14a'].includes(originId) || ['A12', 'A13', 'A14a'].includes(destId)) {
    tips.push('機場航廈區段 (A12-A14a) 享免費搭乘優惠');
  }
  return tips;
}

function serviceMatches(rowService, targetService) {
  const s = normalizeServiceType(rowService);
  return s === 'daily' || s === 'all' || s === targetService;
}

function routeDirection(stationsById, originId, destinationId) {
  const o = stationsById.get(originId);
  const d = stationsById.get(destinationId);
  if (!o || !d) throw new Error('站點不存在');
  if (o.seq === d.seq) throw new Error('出發站與目的站相同');
  return o.seq < d.seq ? 'south' : 'north';
}

function isBetween(stationsById, originId, transferId, destinationId) {
  const o = stationsById.get(originId).seq;
  const t = stationsById.get(transferId).seq;
  const d = stationsById.get(destinationId).seq;
  return o < d ? (o < t && t < d) : (o > t && t > d);
}

function timeAt(run, stationId) {
  return run.stopsByStation.get(stationId)?.minute;
}

function trainStopsAt(run, stationId) {
  return run.stopsByStation.has(stationId);
}

function stationName(stationsById, stationId) {
  return stationsById.get(stationId)?.station_name ?? stationId;
}

export function buildContext(stationsRaw, timetableRaw) {
  const stations = stationsRaw
    .filter((s) => s.station_id && s.station_name)
    .map((s) => ({
      station_id: s.station_id.trim(),
      station_name: s.station_name.trim(),
      seq: Number(s.seq),
      is_express_stop: String(s.is_express_stop ?? '').toLowerCase() === 'true',
    }))
    .sort((a, b) => a.seq - b.seq);

  const stationsById = new Map(stations.map((s) => [s.station_id, s]));
  const grouped = new Map();

  for (const row of timetableRaw) {
    const stationId = row.station_id?.trim();
    if (!stationId || !stationsById.has(stationId)) continue;
    const trainId = row.train_id?.trim();
    if (!trainId) continue;
    const serviceType = normalizeServiceType(row.service_type);
    const direction = normalizeDirection(row.direction);
    const trainType = normalizeTrainType(row.train_type ?? row.type);
    const minute = normalizeServiceMinute(parseClockToMinutes(row.time ?? row.departure_time ?? row.arrival_time));
    const key = `${serviceType}|${direction}|${trainType}|${trainId}`;
    if (!grouped.has(key)) grouped.set(key, {
      trainId,
      serviceType,
      direction,
      trainType,
      stops: [],
      stopsByStation: new Map(),
    });
    const run = grouped.get(key);
    const stop = { stationId, minute, seq: stationsById.get(stationId).seq };
    run.stops.push(stop);
    run.stopsByStation.set(stationId, stop);
  }

  const runs = [...grouped.values()].map((run) => {
    run.stops.sort((a, b) => a.minute - b.minute || a.seq - b.seq);
    return run;
  });

  return { stations, stationsById, runs };
}

function legFromRun(context, run, originId, destinationId, earliestMinute) {
  if (!trainStopsAt(run, originId) || !trainStopsAt(run, destinationId)) return null;
  const departure = timeAt(run, originId);
  const arrival = timeAt(run, destinationId);
  if (!Number.isFinite(departure) || !Number.isFinite(arrival)) return null;
  if (departure < earliestMinute) return null;
  if (arrival < departure) return null;
  return {
    trainId: run.trainId,
    trainType: run.trainType,
    direction: run.direction,
    originId,
    destinationId,
    originName: stationName(context.stationsById, originId),
    destinationName: stationName(context.stationsById, destinationId),
    departure,
    arrival,
    duration: arrival - departure,
  };
}

function directLegs(context, options) {
  const { originId, destinationId, queryMinute, serviceType, direction, trainType } = options;
  const maxDeparture = queryMinute + SEARCH_WINDOW_MINUTES;
  return context.runs
    .filter((run) => run.direction === direction)
    .filter((run) => serviceMatches(run.serviceType, serviceType))
    .filter((run) => trainType === 'any' || run.trainType === trainType)
    .map((run) => legFromRun(context, run, originId, destinationId, queryMinute))
    .filter(Boolean)
    .filter((leg) => leg.departure <= maxDeparture)
    .sort((a, b) => a.arrival - b.arrival || a.departure - b.departure);
}

function makeRoute(type, legs, context) {
  const departure = legs[0].departure;
  const arrival = legs[legs.length - 1].arrival;
  const transfers = legs.length - 1;
  const transferWait = transfers === 1 ? legs[1].departure - legs[0].arrival : 0;
  const transferStationId = transfers ? legs[0].destinationId : null;
  const originId = legs[0].originId;
  const destinationId = legs[legs.length - 1].destinationId;
  const routeObj = {
    type,
    typeLabel: routeTypeLabel(type),
    legs,
    departure,
    arrival,
    duration: arrival - departure,
    transferCount: transfers,
    transferWait,
    transferStationId,
    transferStationName: transferStationId ? stationName(context.stationsById, transferStationId) : null,
    fare: calculateFare(originId, destinationId, context),
  };
  routeObj.tips = getRouteTips(routeObj, context);
  return routeObj;
}


function routeTypeLabel(type) {
  return {
    local: '全程普通車',
    express: '全程直達車',
    local_to_express: '普通車 → 直達車',
    express_to_local: '直達車 → 普通車',
  }[type] ?? type;
}

function transferRoutes(context, options) {
  const { originId, destinationId, queryMinute, serviceType, direction, firstType, secondType } = options;
  const candidates = [];
  const transferStations = context.stations
    .filter((s) => isBetween(context.stationsById, originId, s.station_id, destinationId))
    .map((s) => s.station_id);

  for (const transferId of transferStations) {
    const firstLegs = directLegs(context, {
      originId,
      destinationId: transferId,
      queryMinute,
      serviceType,
      direction,
      trainType: firstType,
    }).slice(0, 12);

    for (const firstLeg of firstLegs) {
      const secondLegs = directLegs(context, {
        originId: transferId,
        destinationId,
        queryMinute: firstLeg.arrival + TRANSFER_BUFFER_MINUTES,
        serviceType,
        direction,
        trainType: secondType,
      }).slice(0, 3);
      for (const secondLeg of secondLegs) {
        candidates.push(makeRoute(`${firstType}_to_${secondType}`, [firstLeg, secondLeg], context));
      }
    }
  }

  return candidates;
}

function dedupeRoutes(routes) {
  const seen = new Set();
  const result = [];
  for (const route of routes) {
    const key = route.legs.map((l) => `${l.trainId}:${l.originId}-${l.destinationId}:${l.departure}-${l.arrival}`).join('|');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(route);
    }
  }
  return result;
}

export function planRoutes(context, params) {
  const originId = params.originId;
  const destinationId = params.destinationId;
  const serviceType = params.serviceType ?? serviceTypeForDate(params.date ?? new Date());
  const rawMinute = typeof params.time === 'number' ? params.time : parseClockToMinutes(params.time);
  const queryMinute = normalizeServiceMinute(rawMinute);
  const direction = routeDirection(context.stationsById, originId, destinationId);

  const localLegs = directLegs(context, { originId, destinationId, queryMinute, serviceType, direction, trainType: 'local' });
  const expressLegs = directLegs(context, { originId, destinationId, queryMinute, serviceType, direction, trainType: 'express' });
  const routes = [
    ...localLegs.slice(0, 8).map((leg) => makeRoute('local', [leg], context)),
    ...expressLegs.slice(0, 8).map((leg) => makeRoute('express', [leg], context)),
    ...transferRoutes(context, { originId, destinationId, queryMinute, serviceType, direction, firstType: 'local', secondType: 'express' }),
    ...transferRoutes(context, { originId, destinationId, queryMinute, serviceType, direction, firstType: 'express', secondType: 'local' }),
  ];

  const sorted = dedupeRoutes(routes)
    .filter((r) => r.arrival >= queryMinute)
    .sort((a, b) => (
      a.arrival - b.arrival ||
      a.transferCount - b.transferCount ||
      a.departure - b.departure ||
      a.duration - b.duration
    ));

  return {
    originId,
    destinationId,
    serviceType,
    direction,
    queryMinute,
    routes: sorted.slice(0, params.limit ?? 5),
    allRoutesCount: sorted.length,
  };
}

export function getFirstDeparture(context, params) {
  const originId = params.originId;
  const destinationId = params.destinationId;
  const serviceType = params.serviceType ?? serviceTypeForDate(params.date ?? new Date());
  const rawMinute = typeof params.time === 'number' ? params.time : parseClockToMinutes(params.time);
  const queryMinute = normalizeServiceMinute(rawMinute);
  const direction = routeDirection(context.stationsById, originId, destinationId);
  const candidates = context.runs
    .filter((run) => run.direction === direction)
    .filter((run) => serviceMatches(run.serviceType, serviceType))
    .filter((run) => trainStopsAt(run, originId))
    .map((run) => ({
      trainId: run.trainId,
      trainType: run.trainType,
      departure: timeAt(run, originId),
      originId,
      direction,
    }))
    .filter((x) => x.departure >= queryMinute)
    .sort((a, b) => a.departure - b.departure);
  return candidates[0] ?? null;
}

export function stationDisplay(station) {
  return `${station.station_id} ${station.station_name}`;
}
