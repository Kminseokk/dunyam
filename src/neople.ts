import {
  AWAKENING_TITLES,
  FASHIONISTA_AURORAS,
  MIKAELA_RAID,
  MIKAELA_RELEASE,
  QUEEN_CREATURES,
  containsAny,
} from './rules';

const API = 'https://api.neople.co.kr/df';

export class NeopleError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface CharacterBase {
  serverId: string;
  characterId: string;
  characterName: string;
  jobId: string;
  jobGrowId: string;
  jobName: string;
  jobGrowName: string;
  fame: number | null;
  adventureName?: string;
}

export interface CharacterDetail extends CharacterBase {
  enchant: 'Y' | 'N';
  title: 'Y' | 'N';
  queenCreature: 'Y' | 'N';
  fashionistaAurora: 'Y' | 'N';
  mikaelaHardCount: number | null;
  mikaelaBase: number | null;
  mikaelaCutoff: string | null;
}

async function call<T>(apiKey: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', apiKey);
  const res = await fetch(url);
  if (!res.ok) throw new NeopleError(res.status, `Neople ${path} -> ${res.status} ${await res.text()}`);
  return res.json<T>();
}

const enc = encodeURIComponent;

// 이름이 정확히 일치하는 캐릭터 검색. serverId 'all'이면 전 서버 (서버당 최대 1명)
export async function searchCharacters(apiKey: string, serverId: string, name: string) {
  const data = await call<{ rows: CharacterBase[] }>(apiKey, `/servers/${enc(serverId)}/characters`, {
    characterName: name,
    limit: '20',
  });
  return data.rows;
}

export function getCharacter(apiKey: string, serverId: string, characterId: string) {
  return call<CharacterBase>(apiKey, `/servers/${enc(serverId)}/characters/${enc(characterId)}`);
}

interface Equipment {
  slotId: string;
  itemName: string;
  enchant?: { status?: { name: string; value: number | string }[] } | null;
}

function summarizeEquipment(equipment: Equipment[]) {
  const support = equipment.find((item) => item.slotId === 'SUPPORT');
  const hasSiv = support?.enchant?.status?.some((s) => s.name === '모든 속성 강화' && Number(s.value) === 12);
  const title = equipment.find((item) => item.slotId === 'TITLE')?.itemName;

  return {
    enchant: hasSiv ? 'Y' : 'N',
    title: containsAny(title, AWAKENING_TITLES) ? 'Y' : 'N',
  } as const;
}

// ─── 미카엘라 하드 클리어 수 (DB에 누적) ───
// cutoff 이전 클리어 수(base)는 확정값으로 저장하고, cutoff 이후만 갱신할 때마다 다시 센다.
// 타임라인 기록이 늦게 올라오는 경우를 위해 cutoff 는 갱신 시점보다 MIKAELA_SETTLE_DAYS 일 전으로 둔다.
// 처음(cutoff 없음)에는 레이드 출시일부터 센다. 시각은 모두 KST 'yyyy-MM-dd HH:mm' (타임라인 row.date 형식).
export interface MikaelaState {
  base: number;
  cutoff: string | null;
}

const DAY = 86400_000;
const MIKAELA_SETTLE_DAYS = 7;
const TIMELINE_MAX_DAYS = 89; // 타임라인 API는 한 번에 최대 90일까지 조회된다
const TIMELINE_MAX_PAGES = 3; // 기간 하나당 최대 페이지 (100건씩)

const kstText = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
const fromKst = (text: string) => new Date(text.replace(' ', 'T') + ':00+09:00');
const apiDate = (text: string) => text.replace(/[-:]/g, '').replace(' ', 'T');

interface RaidTimeline {
  timeline: { next: string | null; rows: { date: string; data: { raidName?: string; hard?: boolean } }[] };
}

// start ~ end 사이 미카엘라 하드 클리어 시각 목록. 90일씩 나눠 조회하고, 경계 시각은 뒤 기간에만 센다.
async function mikaelaClearDates(apiKey: string, path: string, start: string, end: string) {
  const dates: string[] = [];
  for (let from = start; from < end; ) {
    const to = [kstText(new Date(fromKst(from).getTime() + TIMELINE_MAX_DAYS * DAY)), end].sort()[0]!;
    let next: string | null = null;
    for (let page = 0; page < TIMELINE_MAX_PAGES; page++) {
      const data: RaidTimeline = await call<RaidTimeline>(
        apiKey,
        path,
        next ? { next } : { limit: '100', code: '201,210', startDate: apiDate(from), endDate: apiDate(to) },
      );
      for (const row of data.timeline.rows) {
        const inRange = row.date >= from && (row.date < to || to === end);
        if (inRange && row.data.raidName === MIKAELA_RAID && row.data.hard) dates.push(row.date);
      }
      next = data.timeline.next;
      if (!next) break;
    }
    from = to;
  }
  return dates;
}

async function countMikaelaHard(apiKey: string, serverId: string, characterId: string, prev: MikaelaState) {
  const path = `/servers/${enc(serverId)}/characters/${enc(characterId)}/timeline`;
  const now = new Date();
  const cutoff = kstText(new Date(now.getTime() - MIKAELA_SETTLE_DAYS * DAY));
  try {
    const dates = await mikaelaClearDates(apiKey, path, prev.cutoff ?? MIKAELA_RELEASE, kstText(now));
    return {
      mikaelaHardCount: prev.base + dates.length,
      mikaelaBase: prev.base + dates.filter((d) => d < cutoff).length,
      mikaelaCutoff: cutoff,
    };
  } catch (e) {
    console.error('timeline', e);
    return { mikaelaHardCount: null, mikaelaBase: null, mikaelaCutoff: null }; // 실패 시 저장된 값 유지
  }
}

// ─── 스케줄러: 이번 주 레이드(201)·레기온(209) 클리어 기록 ───
// 주간 초기화는 목요일 06:00 (KST). 기록 하나 = { date, type, name }
//   레이드 name: 모드 이름(없으면 레이드 이름). 하드인데 이름에 '하드'가 없으면 '(하드)'를 붙인다
//     (나벨 '무지의 악'처럼 일반·하드 모드 이름이 같은 경우 구분)
//   레기온 name: 레기온 이름
export interface ClearRecord {
  date: string;
  type: 'raid' | 'legion';
  name: string;
}

interface ClearTimeline {
  timeline: {
    next: string | null;
    rows: {
      code: number;
      date: string;
      data: { raidName?: string; modeName?: string; hard?: boolean; regionName?: string };
    }[];
  };
}

// 지금 시각 기준 이번 주 시작 (KST 'yyyy-MM-dd HH:mm')
export function weekStart(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const start = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 6));
  start.setUTCDate(start.getUTCDate() - ((kst.getUTCDay() - 4 + 7) % 7));
  if (start > kst) start.setUTCDate(start.getUTCDate() - 7);
  return start.toISOString().slice(0, 16).replace('T', ' ');
}

export async function getWeeklyClears(apiKey: string, serverId: string, characterId: string) {
  const path = `/servers/${enc(serverId)}/characters/${enc(characterId)}/timeline`;
  const start = weekStart();
  const clears: ClearRecord[] = [];
  let next: string | null = null;
  for (let page = 0; page < TIMELINE_MAX_PAGES; page++) {
    const data: ClearTimeline = await call<ClearTimeline>(
      apiKey,
      path,
      next ? { next } : { limit: '100', code: '201,209', startDate: apiDate(start), endDate: apiDate(kstText(new Date())) },
    );
    for (const row of data.timeline.rows) {
      if (row.date < start) continue;
      if (row.code === 209) {
        if (row.data.regionName) clears.push({ date: row.date, type: 'legion', name: row.data.regionName });
        continue;
      }
      let name = row.data.modeName || row.data.raidName;
      if (!name) continue;
      if (row.data.hard && !name.includes('하드')) name += '(하드)';
      clears.push({ date: row.date, type: 'raid', name });
    }
    next = data.timeline.next;
    if (!next) break;
  }
  return { weekStart: start, clears };
}

// ─── 강화/증폭 기록 (타임라인 401 아이템 강화, 402 아이템 증폭) ───
// 타임라인은 2017년 9월부터 있다. 브라우저가 TIMELINE_MAX_DAYS 이하 구간으로 나눠 요청한다(진행률 표시).
// ticket 은 사용한 강화권·증폭권이다. 보호권 사용 여부는 API에 없다.
export const SERVER_IDS = ['cain', 'diregie', 'siroco', 'prey', 'casillas', 'hilder', 'anton', 'bakal'];
export const UPGRADE_START = '2017-09-01 00:00';
export const UPGRADE_MAX_DAYS = TIMELINE_MAX_DAYS;
const UPGRADE_MAX_PAGES = 20; // 구간 하나당 최대 2,000건

export interface UpgradeRecord {
  date: string;
  type: 'enhance' | 'amplify';
  item: string;
  rarity: string;
  before: number;
  after: number;
  result: boolean;
  safe: boolean;
  ticket: string | null;
}

interface UpgradeTimeline {
  timeline: {
    next: string | null;
    rows: {
      code: number;
      date: string;
      data: {
        itemName: string;
        itemRarity: string;
        before: number;
        after: number;
        result: boolean;
        safe?: boolean;
        ticket?: { itemName: string } | null;
      };
    }[];
  };
}

export const nowKst = () => kstText(new Date());
export const kstDaysBetween = (start: string, end: string) => (fromKst(end).getTime() - fromKst(start).getTime()) / DAY;

// start 이상 end 미만(includeEnd 면 end 포함) 기록
export async function getUpgradeRecords(
  apiKey: string,
  serverId: string,
  characterId: string,
  start: string,
  end: string,
  includeEnd: boolean,
) {
  const path = `/servers/${enc(serverId)}/characters/${enc(characterId)}/timeline`;
  const records: UpgradeRecord[] = [];
  let next: string | null = null;
  for (let page = 0; page < UPGRADE_MAX_PAGES; page++) {
    const data: UpgradeTimeline = await call<UpgradeTimeline>(
      apiKey,
      path,
      next ? { next } : { limit: '100', code: '401,402', startDate: apiDate(start), endDate: apiDate(end) },
    );
    for (const row of data.timeline.rows) {
      if (row.date < start || row.date > end || (row.date === end && !includeEnd)) continue;
      const d = row.data;
      records.push({
        date: row.date,
        type: row.code === 401 ? 'enhance' : 'amplify',
        item: d.itemName,
        rarity: d.itemRarity,
        before: d.before,
        after: d.after,
        result: !!d.result,
        safe: !!d.safe,
        ticket: d.ticket?.itemName ?? null,
      });
    }
    next = data.timeline.next;
    if (!next) break;
  }
  return records;
}

// ─── 스펙체크: 캐릭터 스펙 요약 (스탯·세트·장비·크리처·아바타·안개 동화) ───
interface SpecStatus {
  status: { name: string; value: number | string }[];
}
interface SpecEquipment {
  equipment?: {
    slotId: string;
    slotName: string;
    itemName: string;
    itemRarity: string;
    reinforce: number;
    amplificationName: string | null;
    refine: number;
    itemGradeName?: string;
    tune?: { status?: { name: string; value: number | string }[] }[];
  }[];
  setItemInfo?: {
    setItemName: string;
    setItemRarityName: string;
    active?: { setPoint?: { current: number; max: number } };
  }[];
}
interface SpecAvatar {
  avatar?: { slotId: string; itemName: string; emblems?: { slotColor?: string; itemName?: string }[] }[];
}
interface SpecCreature {
  creature?: {
    itemName: string;
    itemRarity: string;
    artifact?: { slotColor: string; itemName: string; itemRarity: string }[];
  } | null;
}
interface SpecMist {
  mistAssimilation?: { level: number; expRate: string } | null;
}

export async function getSpec(apiKey: string, serverId: string, characterId: string) {
  const path = `/servers/${enc(serverId)}/characters/${enc(characterId)}`;
  const [status, equip, avatar, creature, mist] = await Promise.all([
    call<SpecStatus>(apiKey, `${path}/status`),
    call<SpecEquipment>(apiKey, `${path}/equip/equipment`),
    call<SpecAvatar>(apiKey, `${path}/equip/avatar`),
    call<SpecCreature>(apiKey, `${path}/equip/creature`),
    call<SpecMist>(apiKey, `${path}/equip/mist-assimilation`).catch(() => ({}) as SpecMist),
  ]);

  const stat = (name: string) => Number(status.status.find((s) => s.name === name)?.value ?? 0);
  // 주 스탯은 힘·지능 중 높은 쪽, 크리티컬도 그에 맞춰 물리/마법
  const physical = stat('힘') >= stat('지능');
  const elements = ['화', '수', '명', '암'].map((e) => ({ name: `${e}속성 강화`, value: stat(`${e}속성 강화`) }));
  const element = elements.reduce((a, b) => (b.value > a.value ? b : a));
  const equipment = (equip.equipment ?? []).filter((e) => e.slotId !== 'TITLE').map((e) => ({
    slot: e.slotName,
    name: e.itemName,
    rarity: e.itemRarity,
    reinforce: e.reinforce,
    amplified: !!e.amplificationName,
    refine: e.refine,
    grade: e.itemGradeName ?? '',
    tune: (e.tune ?? []).flatMap((t) => t.status ?? []).filter((s) => s.name).map((s) => `${s.name} ${s.value}`).join(', '),
  }));
  // 빈 엠블렘 칸은 itemName 이 없다
  const platinum = (avatar.avatar ?? []).flatMap((a) => a.emblems ?? [])
    .filter((e) => e.itemName && (e.slotColor === 'PLATINUM' || e.itemName.includes('플래티넘')));

  return {
    stats: {
      fame: stat('모험가 명성'),
      buffer: stat('버프력') > 0,
      attack: stat('공격력 증가'),
      attackAmp: stat('공격력 증폭'),
      buff: stat('버프력'),
      buffAmp: stat('버프력 증폭'),
      mainStat: { name: physical ? '힘' : '지능', value: stat(physical ? '힘' : '지능') },
      crit: { name: physical ? '물리 크리티컬' : '마법 크리티컬', value: stat(physical ? '물리 크리티컬' : '마법 크리티컬') },
      element,
      cooldown: stat('쿨타임 감소'),
    },
    title: (equip.equipment ?? []).find((e) => e.slotId === 'TITLE')?.itemName ?? null,
    sets: (equip.setItemInfo ?? []).map((s) => ({
      name: s.setItemName,
      rarity: s.setItemRarityName,
      point: s.active?.setPoint?.current ?? null,
      max: s.active?.setPoint?.max ?? null,
    })),
    equipment,
    creature: creature.creature
      ? {
          name: creature.creature.itemName,
          rarity: creature.creature.itemRarity,
          artifacts: (creature.creature.artifact ?? []).map((a) => ({ color: a.slotColor, name: a.itemName, rarity: a.itemRarity })),
        }
      : null,
    aura: (avatar.avatar ?? []).find((a) => a.slotId === 'AURORA')?.itemName ?? null,
    platinum: platinum.map((e) => e.itemName!),
    mist: mist.mistAssimilation ? { level: mist.mistAssimilation.level, rate: mist.mistAssimilation.expRate } : null,
  };
}

export async function getCharacterDetail(
  apiKey: string,
  base: CharacterBase,
  mikaela: MikaelaState,
): Promise<CharacterDetail> {
  const path = `/servers/${enc(base.serverId)}/characters/${enc(base.characterId)}`;
  const [equip, avatar, creature, mikaelaResult] = await Promise.all([
    call<{ equipment?: Equipment[] }>(apiKey, `${path}/equip/equipment`),
    call<{ avatar?: { slotId: string; itemName: string }[] }>(apiKey, `${path}/equip/avatar`),
    call<{ creature?: { itemName: string } | null }>(apiKey, `${path}/equip/creature`),
    countMikaelaHard(apiKey, base.serverId, base.characterId, mikaela),
  ]);

  const aurora = avatar.avatar?.find((a) => a.slotId === 'AURORA')?.itemName;

  return {
    ...base,
    ...summarizeEquipment(equip.equipment ?? []),
    queenCreature: containsAny(creature.creature?.itemName, QUEEN_CREATURES) ? 'Y' : 'N',
    fashionistaAurora: containsAny(aurora, FASHIONISTA_AURORAS) ? 'Y' : 'N',
    ...mikaelaResult,
  };
}
