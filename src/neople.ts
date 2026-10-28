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
