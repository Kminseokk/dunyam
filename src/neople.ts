import {
  AWAKENING_TITLES,
  CUSTOM_EPICS,
  DARK_LAND_REGION,
  DARK_LAND_START,
  FASHIONISTA_AURORAS,
  MIST_GEAR_SET,
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
  mistGearCount: number;
  customEpicCount: number;
  enchant: 'Y' | 'N';
  title: 'Y' | 'N';
  queenCreature: 'Y' | 'N';
  fashionistaAurora: 'Y' | 'N';
  darkLandCount: number | null;
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

export async function searchCharacter(apiKey: string, serverId: string, name: string) {
  const data = await call<{ rows: CharacterBase[] }>(apiKey, `/servers/${enc(serverId)}/characters`, {
    characterName: name,
  });
  return data.rows[0] ?? null;
}

export function getCharacter(apiKey: string, serverId: string, characterId: string) {
  return call<CharacterBase>(apiKey, `/servers/${enc(serverId)}/characters/${enc(characterId)}`);
}

interface Equipment {
  slotId: string;
  itemName: string;
  setItemName?: string | null;
  enchant?: { status?: { name: string; value: number | string }[] } | null;
  fixedOption?: { level?: number };
  customOption?: { level?: number };
}

function summarizeEquipment(equipment: Equipment[]) {
  let customEpicCount = 0;
  let mistGearCount = 0;
  let itemLevelSum = 0;
  for (const item of equipment) {
    customEpicCount += CUSTOM_EPICS.filter((name) => item.itemName.includes(name)).length;
    if (item.setItemName?.includes(MIST_GEAR_SET)) mistGearCount++;
    // 선계(仙) 업그레이드된 장비의 성장 레벨만 합산
    if (item.itemName.includes('仙')) {
      itemLevelSum += item.fixedOption?.level ?? item.customOption?.level ?? 0;
    }
  }

  const support = equipment.find((item) => item.slotId === 'SUPPORT');
  const hasSiv = support?.enchant?.status?.some((s) => s.name === '모든 속성 강화' && Number(s.value) === 12);
  const title = equipment.find((item) => item.slotId === 'TITLE')?.itemName;

  return {
    customEpicCount,
    mistGearCount,
    itemLevelSum,
    enchant: hasSiv ? 'Y' : 'N',
    title: containsAny(title, AWAKENING_TITLES) ? 'Y' : 'N',
  } as const;
}

// 타임라인 API는 조회 기간이 최대 90일이라 그 안에서만 집계한다.
function timelineRange() {
  const kst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString();
  const fmt = (iso: string) => iso.slice(0, 16).replace(/[-:]/g, '');
  const now = new Date();
  const end = fmt(kst(now));
  const start = fmt(kst(new Date(now.getTime() - 89 * 86400_000)));
  return { startDate: start > DARK_LAND_START ? start : DARK_LAND_START, endDate: end };
}

async function countDarkLand(apiKey: string, serverId: string, characterId: string) {
  try {
    const data = await call<{ timeline: { rows: { data: { regionName?: string } }[] } }>(
      apiKey,
      `/servers/${enc(serverId)}/characters/${enc(characterId)}/timeline`,
      { limit: '50', code: '209', ...timelineRange() },
    );
    return data.timeline.rows.filter((row) => row.data.regionName === DARK_LAND_REGION).length;
  } catch (e) {
    console.error('timeline', e);
    return null;
  }
}

export async function getCharacterDetail(apiKey: string, base: CharacterBase): Promise<CharacterDetail> {
  const path = `/servers/${enc(base.serverId)}/characters/${enc(base.characterId)}`;
  const [equip, avatar, creature, darkLandCount] = await Promise.all([
    call<{ equipment?: Equipment[] }>(apiKey, `${path}/equip/equipment`),
    call<{ avatar?: { slotId: string; itemName: string }[] }>(apiKey, `${path}/equip/avatar`),
    call<{ creature?: { itemName: string } | null }>(apiKey, `${path}/equip/creature`),
    countDarkLand(apiKey, base.serverId, base.characterId),
  ]);

  const aurora = avatar.avatar?.find((a) => a.slotId === 'AURORA')?.itemName;

  return {
    ...base,
    ...summarizeEquipment(equip.equipment ?? []),
    queenCreature: containsAny(creature.creature?.itemName, QUEEN_CREATURES) ? 'Y' : 'N',
    fashionistaAurora: containsAny(aurora, FASHIONISTA_AURORAS) ? 'Y' : 'N',
    darkLandCount,
  };
}
