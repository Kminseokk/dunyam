import {
  AWAKENING_TITLES,
  FASHIONISTA_AURORAS,
  MIKAELA_RAID,
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
  itemLevelSum: number;
  enchant: 'Y' | 'N';
  title: 'Y' | 'N';
  queenCreature: 'Y' | 'N';
  fashionistaAurora: 'Y' | 'N';
  mikaelaHardCount: number | null;
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
  fixedOption?: { level?: number };
  customOption?: { level?: number };
}

function summarizeEquipment(equipment: Equipment[]) {
  let itemLevelSum = 0;
  for (const item of equipment) {
    // 선계(仙) 업그레이드된 장비의 성장 레벨만 합산
    if (item.itemName.includes('仙')) {
      itemLevelSum += item.fixedOption?.level ?? item.customOption?.level ?? 0;
    }
  }

  const support = equipment.find((item) => item.slotId === 'SUPPORT');
  const hasSiv = support?.enchant?.status?.some((s) => s.name === '모든 속성 강화' && Number(s.value) === 12);
  const title = equipment.find((item) => item.slotId === 'TITLE')?.itemName;

  return {
    itemLevelSum,
    enchant: hasSiv ? 'Y' : 'N',
    title: containsAny(title, AWAKENING_TITLES) ? 'Y' : 'N',
  } as const;
}

// 타임라인 API는 조회 기간이 최대 90일이라 최근 90일만 집계한다.
function timelineRange() {
  const kst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString();
  const fmt = (iso: string) => iso.slice(0, 16).replace(/[-:]/g, '');
  const now = new Date();
  return { startDate: fmt(kst(new Date(now.getTime() - 89 * 86400_000))), endDate: fmt(kst(now)) };
}

interface RaidTimeline {
  timeline: { next: string | null; rows: { data: { raidName?: string; hard?: boolean } }[] };
}

const TIMELINE_MAX_PAGES = 3;

async function countMikaelaHard(apiKey: string, serverId: string, characterId: string) {
  const path = `/servers/${enc(serverId)}/characters/${enc(characterId)}/timeline`;
  try {
    let count = 0;
    let next: string | null = null;
    for (let page = 0; page < TIMELINE_MAX_PAGES; page++) {
      const data: RaidTimeline = await call<RaidTimeline>(
        apiKey,
        path,
        next ? { next } : { limit: '100', code: '201,210', ...timelineRange() },
      );
      count += data.timeline.rows.filter((row) => row.data.raidName === MIKAELA_RAID && row.data.hard).length;
      next = data.timeline.next;
      if (!next) break;
    }
    return count;
  } catch (e) {
    console.error('timeline', e);
    return null;
  }
}

export async function getCharacterDetail(apiKey: string, base: CharacterBase): Promise<CharacterDetail> {
  const path = `/servers/${enc(base.serverId)}/characters/${enc(base.characterId)}`;
  const [equip, avatar, creature, mikaelaHardCount] = await Promise.all([
    call<{ equipment?: Equipment[] }>(apiKey, `${path}/equip/equipment`),
    call<{ avatar?: { slotId: string; itemName: string }[] }>(apiKey, `${path}/equip/avatar`),
    call<{ creature?: { itemName: string } | null }>(apiKey, `${path}/equip/creature`),
    countMikaelaHard(apiKey, base.serverId, base.characterId),
  ]);

  const aurora = avatar.avatar?.find((a) => a.slotId === 'AURORA')?.itemName;

  return {
    ...base,
    ...summarizeEquipment(equip.equipment ?? []),
    queenCreature: containsAny(creature.creature?.itemName, QUEEN_CREATURES) ? 'Y' : 'N',
    fashionistaAurora: containsAny(aurora, FASHIONISTA_AURORAS) ? 'Y' : 'N',
    mikaelaHardCount,
  };
}
