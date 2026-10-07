import { ENGINE_MAP } from '../src/data/engines';
import { DemoTransport } from '../src/obd/demo-transport';
import { decodeDtc, parseDtcMessages, parseReadiness } from '../src/obd/dtc';
import { Elm327, ElmError } from '../src/obd/elm327';
import { hexToBytes, parseMessages, pickMessage } from '../src/obd/frames';
import { computeChannels, decodeMode01, supportedFromBitmask } from '../src/obd/pids';
import { decodeVin } from '../src/obd/vin';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`ok   ${name}`);
  else {
    failures++;
    console.log(`FAIL ${name}`, detail ?? '');
  }
}
const near = (a: number | undefined, b: number, eps = 0.01) => a !== undefined && Math.abs(a - b) <= eps;

check('decodeDtc P0128', decodeDtc(0x01, 0x28) === 'P0128');
check('decodeDtc U0100', decodeDtc(0xc1, 0x00) === 'U0100');
check('decodeDtc C1234', decodeDtc(0x52, 0x34) === 'C1234');

const single = parseMessages(['7E806410C1AF80D64'], 'can11');
check('single frame', single.length === 1 && single[0].ecu === '7E8' && single[0].data.join(',') === [0x41, 0x0c, 0x1a, 0xf8, 0x0d, 0x64].join(','), single);
const decoded = decodeMode01(single[0].data);
const channels = computeChannels(decoded, {});
check('rpm decode', near(channels.rpm, 1726), channels.rpm);
check('speed decode', channels.speed === 100, channels.speed);

const multi = parseMessages(['7E8 10 14 49 02 01 57 42 41', '7E8 21 44 45 4D 56 31 4E 4C', '7E8 22 30 30 30 30 30 30 31'], 'can11');
check('multi frame length', multi[0]?.data.length === 20, multi);
const vin = String.fromCharCode(...multi[0].data.slice(3));
check('vin assemble', vin === 'WBADEMV1NL0000001', vin);
check('vin decode', decodeVin(vin)?.manufacturer === 'BMW AG' && decodeVin(vin)?.modelYear === 2020, decodeVin(vin));

const twoEcus = parseMessages(['7E903410D00', '7E803410D2A'], 'can11');
check('prefers engine ECU 7E8', pickMessage(twoEcus, 0x01)?.ecu === '7E8');


const gap = parseMessages(['7E8 10 14 49 02 01 57 42 41', '7E8 22 30 30 30 30 30 30 31'], 'can11');
check('drops frames with a missing consecutive frame', gap.length === 0, gap);

const plain = parseMessages(['41 0C 1A F8'], 'plain');
check('plain format', plain[0].data[0] === 0x41 && plain[0].data.length === 4);

const mask = supportedFromBitmask(0, hexToBytes('BE3FA813')!);
check('supported bitmask', mask.includes(0x01) && mask.includes(0x0c) && mask.includes(0x20) && !mask.includes(0x02), mask);

const boostRaw = { 0x0b: [0xc8], 0x33: [0x64] };
check('boost from MAP', near(computeChannels(boostRaw, {}).boost, 1.0), computeChannels(boostRaw, {}).boost);
const pid70 = { 0x70: [0x03, 0x1c, 0x20, 0x1f, 0x40, 0, 0, 0, 0, 0], 0x33: [0x64] };
check('boost from PID 70', near(computeChannels(pid70, {}).boost, 1.5), computeChannels(pid70, {}));
check('boost target', near(computeChannels(pid70, {}).boostTarget, 1.25), computeChannels(pid70, {}));

const readiness = parseReadiness([0x81, 0x07, 0xe5, 0x61]);
check('readiness MIL + count', readiness.milOn && readiness.dtcCount === 1);
check('readiness catalyst incomplete', readiness.monitors.find((m) => m.key === 'catalyst')?.complete === false);

async function live() {
  const demo = new DemoTransport(ENGINE_MAP.b58);
  const elm = new Elm327(demo);
  const reset = await elm.send('ATZ', 3000);
  check('ATZ version', reset.some((l) => l.includes('ELM327')), reset);
  for (const cmd of ['ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATSP0']) await elm.send(cmd);
  const first = await elm.send('0100', 5000);
  const msg = pickMessage(parseMessages(first, 'can11'), 0x01);
  check('0100 supported', !!msg && msg.data[1] === 0x00, first);
  const lines = await elm.send('010C0D0B0F11');
  const m = pickMessage(parseMessages(lines, 'can11'), 0x01);
  const raw = m ? decodeMode01(m.data) : {};
  check('multi pid has 5 values', Object.keys(raw).length === 5, { lines, raw });
  const vinLines = await elm.send('0902', 4000);
  const vinMsg = parseMessages(vinLines, 'can11')[0];
  check('demo vin', String.fromCharCode(...vinMsg.data.slice(3)) === 'WBADEMV1NL0000001', vinLines);
  const dtcLines = await elm.send('03');
  const dtcs = parseDtcMessages(parseMessages(dtcLines, 'can11'), 0x03, 'stored', true);
  check('demo stored DTC', dtcs.length === 1 && dtcs[0].code === 'P0128', { dtcLines, dtcs });
  const cleared = await elm.send('04');
  check('clear answered', !!pickMessage(parseMessages(cleared, 'can11'), 0x04), cleared);
  try {
    await elm.send('03');
    const after = parseDtcMessages(parseMessages(await elm.send('03'), 'can11'), 0x03, 'stored', true);
    check('no DTC after clear', after.length === 0, after);
  } catch (e) {
    check('no DTC after clear', e instanceof ElmError && e.code === 'no-data', e);
  }
  try {
    await elm.send('0150');
    check('unsupported pid gives no-data', false);
  } catch (e) {
    check('unsupported pid gives no-data', e instanceof ElmError && e.code === 'no-data', e);
  }
  elm.setEchoMatching(true);
  await elm.send('ATE1');
  const late = elm.send('0105', 1);
  await late.catch(() => undefined);
  const after = await elm.send('010D', 2000);
  const afterMsg = pickMessage(parseMessages(after, 'can11'), 0x01);
  check('late reply is not attributed to the next command', afterMsg?.data[1] === 0x0d, after);
  await elm.close();
}

live().then(() => {
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
});
