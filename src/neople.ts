import {
  AURA_GRADES,
  CREATURE_GRADES,
  ENCHANT_GRADES,
  MIKAELA_RAID,
  MIKAELA_RELEASE,
  TITLE_GRADES,
  TITLE_GRADES_BUFFER,
  gradeOf,
  isBufferJob,
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
  itemId: string;
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
        itemId: string;
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
        itemId: d.itemId,
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
  jobGrowName?: string;
  equipment?: {
    slotId: string;
    slotName: string;
    itemId: string;
    itemName: string;
    itemRarity: string;
    reinforce: number;
    amplificationName: string | null;
    refine: number;
    itemGradeName?: string;
    tune?: { status?: { name: string; value: number | string }[] }[];
    enchant?: {
      status?: { name: string; value: number | string }[];
      reinforceSkill?: { skills?: { value: number }[] }[];
    } | null;
  }[];
  setItemInfo?: {
    setItemName: string;
    setItemRarityName: string;
    active?: { setPoint?: { current: number; max: number } };
  }[];
}
interface SpecAvatar {
  avatar?: {
    slotId: string;
    itemId?: string;
    itemName: string;
    itemRarity?: string;
    emblems?: { slotColor?: string; itemName?: string }[];
  }[];
}
interface SpecCreature {
  creature?: {
    itemId: string;
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
    ...equipView(equip, avatar, creature, await wornOptions(apiKey, equip, avatar, creature)),
    mist: mist.mistAssimilation ? { level: mist.mistAssimilation.level, rate: mist.mistAssimilation.expRate } : null,
  };
}

// 빈 엠블렘 칸은 itemName 이 없다
function platinumEmblems(avatar: SpecAvatar) {
  return (avatar.avatar ?? []).flatMap((a) => a.emblems ?? [])
    .filter((e) => e.itemName && (e.slotColor === 'PLATINUM' || e.itemName.includes('플래티넘')))
    .map((e) => e.itemName!);
}

// 아바타 요약에 세는 8부위 (오라·무기·스킨 아바타 제외)
const AVATAR_SLOTS = ['HEADGEAR', 'HAIR', 'FACE', 'BREAST', 'JACKET', 'PANTS', 'WAIST', 'SHOES'];

// ─── 아이템 옵션 (아이템 상세 API) ───
// 옵션 목록(itemStatus) 밖에 있는 두 가지를 옵션으로 바꿔 넣는다.
//   - itemReinforceSkill(직업별 패시브 스킬 +N): passive 이름으로 (오라는 '진각성 패시브', 크리처는 '2차 각성 패시브')
//   - 설명의 'n 레벨 액티브 스킬 공격력 x% 증가': '액티브 스킬 공격력' = 'x% (n레벨)' (등급은 앞의 x 로 판정)
//   - 레벨 구간 스킬 +N (칭호는 itemBuff.reinforceSkill 의 levelRange): 'a~b 레벨' = '+N'
// 아이템 옵션은 바뀌지 않으므로 엣지 캐시에 오래 둔다 (캐시 키는 API 키를 뺀 요청 주소)
const ITEM_TTL = 7 * 24 * 3600;
type ItemOption = { name: string; value: string };
interface ReinforceSkill {
  skills?: { value: number }[];
  levelRange?: { minLevel: number; maxLevel: number; value: number }[];
}
interface ItemDetail {
  itemStatus?: { name: string; value: number | string }[];
  itemReinforceSkill?: ReinforceSkill[];
  itemBuff?: { reinforceSkill?: ReinforceSkill[] } | null;
  itemExplainDetail?: string;
}

async function getItemOptions(apiKey: string, itemId: string, passive: string): Promise<ItemOption[]> {
  const key = new Request(`${API}/items/${enc(itemId)}`);
  const hit = await caches.default.match(key);
  if (hit) return hit.json<ItemOption[]>();
  const detail = await call<ItemDetail>(apiKey, `/items/${enc(itemId)}`);
  const options = (detail.itemStatus ?? [])
    .filter((s) => s.name !== '모험가 명성')
    .map((s) => ({ name: s.name, value: String(s.value) }));
  const skill = Math.max(0, ...(detail.itemReinforceSkill ?? []).flatMap((j) => j.skills ?? []).map((s) => s.value));
  if (skill) options.push({ name: passive, value: `+${skill}` });
  const active = detail.itemExplainDetail?.match(/(\d+)\s*레벨 액티브 스킬 공격력\s*([\d.]+)%\s*증가/);
  if (active) options.push({ name: '액티브 스킬 공격력', value: `${active[2]}% (${active[1]}레벨)` });
  for (const r of [...(detail.itemReinforceSkill ?? []), ...(detail.itemBuff?.reinforceSkill ?? [])].flatMap((s) => s.levelRange ?? [])) {
    options.push({ name: `${r.minLevel}~${r.maxLevel} 레벨`, value: `+${r.value}` });
  }
  await caches.default.put(key, new Response(JSON.stringify(options), { headers: { 'Cache-Control': `public, max-age=${ITEM_TTL}` } }));
  return options;
}

// ─── 아이템 부위 (강화/증폭 기록 손익 계산용) ───
// 무기 / 그 외(방어구·악세서리·특수장비). 비용과 실패 결과가 부위에 따라 다르다. 바뀌지 않으므로 아이템별로 오래 캐시
export const ITEM_PARTS_MAX = 15; // 요청 한 번에 조회할 아이템 수 (캐시 조회·저장도 외부 호출로 세어 여유 있게)

async function getItemPart(apiKey: string, itemId: string): Promise<'weapon' | 'armor'> {
  const key = new Request(`${API}/items/${enc(itemId)}?part`);
  const hit = await caches.default.match(key);
  if (hit) return (await hit.text()) === 'weapon' ? 'weapon' : 'armor';
  const detail = await call<{ itemType?: string }>(apiKey, `/items/${enc(itemId)}`);
  const part = detail.itemType === '무기' ? 'weapon' : 'armor';
  await caches.default.put(key, new Response(part, { headers: { 'Cache-Control': `public, max-age=${ITEM_TTL}` } }));
  return part;
}

// { 아이템 id: 'weapon' | 'armor' | null(조회 실패) }
export async function getItemParts(apiKey: string, itemIds: string[]) {
  const parts = await Promise.all(itemIds.map((id) => getItemPart(apiKey, id).catch(() => null)));
  return Object.fromEntries(itemIds.map((id, i) => [id, parts[i]]));
}

// 착용한 오라·크리처·칭호의 옵션 (없거나 조회에 실패하면 null → 등급 없음)
function wornOptions(apiKey: string, equip: SpecEquipment, avatar: SpecAvatar, creature: SpecCreature) {
  const options = (id: string | undefined, passive: string) =>
    id ? getItemOptions(apiKey, id, passive).catch(() => null) : Promise.resolve(null);
  return Promise.all([
    options(avatar.avatar?.find((a) => a.slotId === 'AURORA')?.itemId, '진각성 패시브'),
    options(creature.creature?.itemId, '2차 각성 패시브'),
    options(equip.equipment?.find((e) => e.slotId === 'TITLE')?.itemId, '패시브'),
  ]);
}

// 마법부여 옵션과 등급. 버퍼 마법부여의 버프 스킬 +N(reinforceSkill, 직업별로 같은 값)은 '특정 스킬 레벨 증가' 옵션으로 넣는다.
// 등급 기준이 있는 부위에 마법부여가 없으면 '없음'
function enchantView(slotId: string, enchant: NonNullable<SpecEquipment['equipment']>[number]['enchant']) {
  const options: ItemOption[] = (enchant?.status ?? []).map((s) => ({ name: s.name, value: String(s.value) }));
  const skill = Math.max(0, ...(enchant?.reinforceSkill ?? []).flatMap((j) => j.skills ?? []).map((s) => s.value));
  if (skill) options.push({ name: '특정 스킬 레벨 증가', value: `+${skill}` });
  const rule = ENCHANT_GRADES[slotId];
  return { enchant: options, enchantGrade: options.length || !rule ? gradeOf(rule, options) : '없음' };
}

// 장비·칭호·세트·크리처·오라·아바타 정리 (스펙체크와 모험단 장비 보기가 같이 씀)
function equipView(
  equip: SpecEquipment,
  avatar: SpecAvatar,
  creature: SpecCreature,
  [auraOpts, creatureOpts, titleOpts]: (ItemOption[] | null)[],
) {
  const item = (e?: { itemId?: string; itemName: string; itemRarity?: string } | null) =>
    e ? { id: e.itemId ?? null, name: e.itemName, rarity: e.itemRarity ?? '' } : null;
  const list = equip.equipment ?? [];
  const avatars = avatar.avatar ?? [];
  const parts = avatars.filter((a) => AVATAR_SLOTS.includes(a.slotId));

  const view = {
    equipment: list.filter((e) => e.slotId !== 'TITLE').map((e) => ({
      slot: e.slotId,
      ...item(e)!,
      reinforce: e.reinforce,
      amplified: !!e.amplificationName,
      refine: e.refine,
      grade: e.itemGradeName ?? '',
      tune: (e.tune ?? []).flatMap((t) => t.status ?? []).filter((s) => s.name).map((s) => `${s.name} ${s.value}`).join(', '),
      ...enchantView(e.slotId, e.enchant),
    })),
    title: (() => {
      const t = item(list.find((e) => e.slotId === 'TITLE'));
      const rule = isBufferJob(equip.jobGrowName) ? TITLE_GRADES_BUFFER : TITLE_GRADES;
      return t && { ...t, options: titleOpts ?? [], grade: titleOpts ? gradeOf(rule, titleOpts) : null };
    })(),
    sets: (equip.setItemInfo ?? []).map((s) => ({
      name: s.setItemName,
      rarity: s.setItemRarityName,
      point: s.active?.setPoint?.current ?? null,
      max: s.active?.setPoint?.max ?? null,
    })),
    creature: creature.creature
      ? {
          ...item(creature.creature)!,
          artifacts: (creature.creature.artifact ?? []).map((a) => ({ color: a.slotColor, name: a.itemName, rarity: a.itemRarity })),
          options: creatureOpts ?? [],
          grade: creatureOpts ? gradeOf(CREATURE_GRADES, creatureOpts) : null,
        }
      : null,
    aura: (() => {
      const a = item(avatars.find((x) => x.slotId === 'AURORA'));
      return a && { ...a, options: auraOpts ?? [], grade: auraOpts ? gradeOf(AURA_GRADES, auraOpts) : null };
    })(),
    avatar: {
      rare: parts.filter((a) => a.itemRarity === '레어').length,
      total: AVATAR_SLOTS.length,
      platinum: platinumEmblems(avatar),
    },
  };
  return { ...view, allBlue: allBlueOf(view) };
}

// 올 블루 판정에 쓰는 마법부여 부위 이름 (ENCHANT_GRADES 의 12부위)
const ENCHANT_SLOT_NAMES: Record<string, string> = {
  WEAPON: '무기', SHOULDER: '머리어깨', JACKET: '상의', PANTS: '하의', WAIST: '벨트', SHOES: '신발',
  WRIST: '팔찌', AMULET: '목걸이', RING: '반지', SUPPORT: '보조장비', MAGIC_STON: '마법석', EARRING: '귀걸이',
};

// 올 블루: 마법부여(등급 기준이 있는 12부위)·칭호·크리처·오라가 모두 종결이면 달성. missing 은 종결이 아닌 항목
type Graded = { grade: string | null } | null;
function allBlueOf(view: {
  equipment: { slot: string; enchantGrade: string | null }[];
  title: Graded;
  creature: Graded;
  aura: Graded;
}) {
  const missing: string[] = [];
  for (const slot of Object.keys(ENCHANT_GRADES)) {
    const e = view.equipment.find((x) => x.slot === slot);
    if (e?.enchantGrade !== '종결') missing.push(`${ENCHANT_SLOT_NAMES[slot]} 마법부여 · ${e ? (e.enchantGrade ?? '-') : '미착용'}`);
  }
  const items = [['칭호', view.title], ['크리처', view.creature], ['오라', view.aura]] as const;
  for (const [label, it] of items) {
    if (it?.grade !== '종결') missing.push(`${label} · ${it ? (it.grade ?? '-') : '미착용'}`);
  }
  return { done: !missing.length, missing };
}

// ─── 모험단 장비 보기: 캐릭터 한 명의 장비 (네오플 API 3회 + 오라·크리처·칭호 옵션 3회, 옵션은 캐시) ───
export async function getEquipView(apiKey: string, serverId: string, characterId: string) {
  const path = `/servers/${enc(serverId)}/characters/${enc(characterId)}`;
  const [equip, avatar, creature] = await Promise.all([
    call<SpecEquipment>(apiKey, `${path}/equip/equipment`),
    call<SpecAvatar>(apiKey, `${path}/equip/avatar`),
    call<SpecCreature>(apiKey, `${path}/equip/creature`),
  ]);
  return equipView(equip, avatar, creature, await wornOptions(apiKey, equip, avatar, creature));
}

export async function getCharacterDetail(
  apiKey: string,
  base: CharacterBase,
  mikaela: MikaelaState,
): Promise<CharacterDetail> {
  return { ...base, ...(await countMikaelaHard(apiKey, base.serverId, base.characterId, mikaela)) };
}
