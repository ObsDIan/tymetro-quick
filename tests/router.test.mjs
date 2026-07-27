import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseCsv } from '../src/csv.js';
import { buildContext, formatMinutes, planRoutes, serviceTypeForDate } from '../src/router.js';

const stations = parseCsv(await fs.readFile(new URL('../data/stations.csv', import.meta.url), 'utf8'));
const timetable = parseCsv(await fs.readFile(new URL('../data/timetable.csv', import.meta.url), 'utf8'));
const context = buildContext(stations, timetable);

assert.ok(context.stations.length >= 21, 'station count');
assert.ok(context.runs.length > 100, 'timetable should build many train runs');
assert.equal(serviceTypeForDate(new Date('2026-06-25T00:00:00')), 'weekday');
assert.equal(serviceTypeForDate(new Date('2026-06-27T00:00:00')), 'weekend');

const south = planRoutes(context, {
  originId: 'A1',
  destinationId: 'A18',
  time: '08:00',
  date: new Date('2026-06-25T00:00:00'),
  limit: 5,
});
assert.ok(south.routes.length > 0, 'A1 -> A18 should have routes');
assert.ok(south.routes.some((r) => r.type === 'express_to_local') || south.routes.some((r) => r.type === 'local'), 'A1 -> A18 should include direct local or express-to-local');
assert.equal(south.direction, 'south');
assert.ok(south.routes[0].arrival >= south.routes[0].departure, 'arrival after departure');

const north = planRoutes(context, {
  originId: 'A18',
  destinationId: 'A1',
  time: '18:00',
  date: new Date('2026-06-25T00:00:00'),
  limit: 5,
});
assert.ok(north.routes.length > 0, 'A18 -> A1 should have routes');
assert.equal(north.direction, 'north');
assert.ok(north.routes.some((r) => r.type === 'local_to_express') || north.routes.some((r) => r.type === 'local'), 'A18 -> A1 should include local-to-express or local');

const sameStation = () => planRoutes(context, {
  originId: 'A1',
  destinationId: 'A1',
  time: '08:00',
  date: new Date('2026-06-25T00:00:00'),
});
assert.throws(sameStation, /相同/);

const late = planRoutes(context, {
  originId: 'A1',
  destinationId: 'A13',
  time: '23:50',
  date: new Date('2026-06-25T00:00:00'),
  limit: 5,
});
assert.ok(Array.isArray(late.routes));

console.log('router tests passed');
console.log(`sample best route A1 -> A18 at 08:00: ${south.routes[0].typeLabel}, ${formatMinutes(south.routes[0].arrival)} arrival`);
