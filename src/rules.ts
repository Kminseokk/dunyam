// 등록·집계 기준

// 모험단에 새로 등록할 수 있는 최소 명성
export const MIN_FAME = 50000;

// 타임라인에서 클리어 횟수를 세는 레이드 (레이드 201 + 선발대 210, 하드만)
export const MIKAELA_RAID = '무너진 성자 미카엘라';
// 레이드 출시일 (KST). 처음 집계할 때 이 시점부터 센다.
export const MIKAELA_RELEASE = '2026-08-06 00:00';

// ─── 등급 (종결 / 준종결 / 보급) ───
// 등급마다 조건 목록을 둔다. 조건 하나는 { 옵션 이름: 최소값 } 이고, 나열한 옵션이 모두 최소값 이상이면 맞는 것으로 본다.
// 조건이 여러 개면 하나만 맞아도 된다. 종결 → 준종결 순으로 보고, 둘 다 아니면 보급.
// 옵션 이름은 네오플 API 표기 (공백은 무시), 값은 숫자 ('%' 는 뗀다). 예: { '최종 데미지 증가': 3, '힘': 90 }
// 조건이 하나도 없는 부위는 등급을 매기지 않는다 (null).
export type Grade = '종결' | '준종결' | '보급';
type Condition = Record<string, number>;
type GradeRule = { 종결?: Condition[]; 준종결?: Condition[] };

// 마법부여: 무기 + 방어구·악세사리·특수장비 11부위 각각
// '스탯'은 힘·지능, '공격력'은 물리 공격력, '크리'는 물리 크리티컬 히트로 본다 (같은 값으로 함께 붙는 옵션)
// '모든 속성 강화'에는 단일 속성 강화도 포함된다 (gradeOf 참고)
// 부위마다 딜러 조건과 버퍼 조건을 함께 두고, 둘 중 하나만 맞으면 된다.
// 버퍼는 스탯만 본다 (버프 스킬 +N 은 보지 않음). 준종결은 '준종결 스탯 ~ 종결 스탯 - 1' 이고,
// 종결을 먼저 보므로 준종결에는 최소값만 둔다.
const buff = (stat: number): Condition => ({ 힘: stat, 지능: stat });

// 상의·하의 (버퍼 하의는 기준을 따로 받지 않아 상의와 같게 둠)
const TOP_BOTTOM_ENCHANT: GradeRule = {
  종결: [{ 힘: 90, 지능: 90, '물리 공격력': 110, '최종 데미지 증가': 3 }, buff(210)],
  준종결: [{ 힘: 90, 지능: 90, '물리 공격력': 110, '최종 데미지 증가': 2 }, buff(125)],
};
const ACCESSORY_ENCHANT: GradeRule = {
  종결: [{ '모든 속성 강화': 35, '최종 데미지 증가': 2 }, buff(120)],
  준종결: [{ '모든 속성 강화': 35, '최종 데미지 증가': 1 }, buff(100)],
};

export const ENCHANT_GRADES: Record<string, GradeRule> = {
  WEAPON: { // 무기
    종결: [{ '모든 속성 강화': 15, '물리 공격력': 30 }, buff(110)],
    준종결: [{ '모든 속성 강화': 15 }, buff(100)],
  },
  // 방어구
  SHOULDER: { // 머리어깨
    종결: [{ '최종 데미지 증가': 3 }, buff(120)],
    준종결: [{ '최종 데미지 증가': 2 }, buff(100)],
  },
  JACKET: TOP_BOTTOM_ENCHANT, // 상의
  PANTS: TOP_BOTTOM_ENCHANT, // 하의
  WAIST: { // 벨트
    종결: [{ 힘: 50, 지능: 50, '물리 공격력': 15, '물리 크리티컬 히트': 3, '최종 데미지 증가': 3 }, buff(120)],
    준종결: [{ 힘: 40, 지능: 40, '물리 공격력': 10, '물리 크리티컬 히트': 3, '최종 데미지 증가': 2 }, buff(100)],
  },
  SHOES: { // 신발
    종결: [{ 힘: 50, 지능: 50, '물리 공격력': 15, '최종 데미지 증가': 3 }, buff(170)],
    준종결: [{ 힘: 40, 지능: 40, '물리 공격력': 10, '최종 데미지 증가': 2 }, buff(100)],
  },
  // 악세사리
  WRIST: ACCESSORY_ENCHANT, // 팔찌
  AMULET: ACCESSORY_ENCHANT, // 목걸이
  RING: ACCESSORY_ENCHANT, // 반지
  // 특수장비
  SUPPORT: { // 보조장비
    종결: [{ '물리 크리티컬 히트': 3, '모든 속성 강화': 15, '최종 데미지 증가': 4 }, buff(200)],
    준종결: [{ '물리 크리티컬 히트': 3, '모든 속성 강화': 12, '공격력 증폭': 3 }, buff(100)],
  },
  MAGIC_STON: { // 마법석
    종결: [{ '모든 속성 강화': 45 }, buff(190)],
    준종결: [{ '모든 속성 강화': 40 }, buff(120)],
  },
  EARRING: { // 귀걸이
    종결: [{ '모든 속성 강화': 35, 힘: 120, 지능: 120 }, buff(300)],
    준종결: [{ '모든 속성 강화': 25, 힘: 100, 지능: 100 }, buff(250)],
  },
};

// 오라 아바타 (아이템 옵션 기준. '진각성 패시브'는 진각성 패시브 스킬 +N)
export const AURA_GRADES: GradeRule = {
  종결: [{
    '물리 공격력': 50, 힘: 100, 지능: 100, '모든 속성 강화': 70, '물리 크리티컬 히트': 5,
    '공격력 증폭': 9, '버프력 증폭': 6, '진각성 패시브': 1,
  }],
  준종결: [{
    '물리 공격력': 50, 힘: 100, 지능: 100, '모든 속성 강화': 40, '물리 크리티컬 히트': 5,
    '공격력 증폭': 6, '버프력 증폭': 4,
  }],
};

// 크리처 (아이템 옵션 기준. '2차 각성 패시브'는 2차 각성 패시브 스킬 +N,
// '액티브 스킬 공격력'은 설명의 'n 레벨 액티브 스킬 공격력 x% 증가'의 x)
const CREATURE_BASE = {
  힘: 150, 지능: 150, '모든 속성 강화': 40, '물리 크리티컬 히트': 3,
  '공격력 증폭': 40, '버프력 증폭': 10, '2차 각성 패시브': 1,
};
export const CREATURE_GRADES: GradeRule = {
  종결: [{ ...CREATURE_BASE, '액티브 스킬 공격력': 10 }],
  준종결: [CREATURE_BASE],
};

// 칭호 (아이템 옵션 기준. '1~95 레벨'은 1~95 레벨 스킬 +N, '액티브 스킬 공격력'은 크리처와 같음)
const TITLE_BASE = {
  힘: 100, 지능: 100, '모든 속성 강화': 10, '물리 크리티컬 히트': 3,
  '공격력 증폭': 20, '버프력 증폭': 2, '1~95 레벨': 1,
};
export const TITLE_GRADES: GradeRule = {
  종결: [{ ...TITLE_BASE, '액티브 스킬 공격력': 10 }],
  준종결: [TITLE_BASE],
};
// 버퍼 직업은 액티브 스킬 공격력이 없어도 종결
export const TITLE_GRADES_BUFFER: GradeRule = { 종결: [TITLE_BASE] };

// 버퍼 4직업군의 전직명 (네오플 API jobGrowName 표기와 정확히 같아야 한다. 진각성은 '眞 ' 을 붙인 이름)
export const BUFFER_JOBS: Record<string, string[]> = {
  크루세이더: ['크루세이더', '홀리오더', '세인트', '眞 크루세이더', '에반젤리스트', '세라핌'],
  인챈트리스: ['인챈트리스', '블랙 메이든', '헤카테', '眞 인챈트리스'],
  뮤즈: ['뮤즈', '헤드라이너', '트렌드세터', '眞 뮤즈'],
  패러메딕: ['패러메딕', '스키퍼', '코로니스', '眞 패러메딕'],
};
const BUFFER_JOB_NAMES = new Set(Object.values(BUFFER_JOBS).flat());
export const isBufferJob = (jobGrowName: string | null | undefined) =>
  !!jobGrowName && BUFFER_JOB_NAMES.has(jobGrowName.trim());

const optionKey = (name: string) => name.replace(/\s/g, '');

export function gradeOf(rule: GradeRule | undefined, options: { name: string; value: number | string }[]): Grade | null {
  if (!rule || (!rule.종결?.length && !rule.준종결?.length)) return null;
  const values = new Map(options.map((o) => [optionKey(o.name), parseFloat(String(o.value))]));
  // 단일 속성 강화(예: 수속성강화 35)는 같은 수치의 모든 속성 강화와 같게 본다
  const elements = ['모든', '화', '수', '명', '암'].map((e) => values.get(`${e}속성강화`) ?? 0);
  values.set('모든속성강화', Math.max(...elements));
  const meets = (conditions?: Condition[]) =>
    !!conditions?.some((c) => Object.entries(c).every(([name, min]) => (values.get(optionKey(name)) ?? 0) >= min));
  if (meets(rule.종결)) return '종결';
  if (meets(rule.준종결)) return '준종결';
  return '보급';
}
