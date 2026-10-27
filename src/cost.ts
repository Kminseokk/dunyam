// 강화 비용 (기댓값 계산기용)
// 출처: 나무위키 「던전앤파이터/강화」 강화 비용 표 (2026-10-23 판)
// 단계별 골드 = 1강 기준 골드 × goldMultiplier

export type EnhancePart = 'weapon' | 'armor'; // armor: 방어구·악세서리·특수장비

// 1강(0→1) 기준 골드. ⚠️ 출처 표가 100레벨 장비 기준이라, 현재 장비 레벨 값으로 확인 후 교체 필요
export const ENHANCE_BASE_GOLD: Record<EnhancePart, number> = {
  weapon: 177_300,
  armor: 147_750,
};

// 인덱스 = 목표 강화 수치 (예: ENHANCE_STEPS[5] 는 +4 → +5 시도)
//   rate: 기본 성공 확률, cube: 무색 큐브 조각 소모량, goldMultiplier: 1강 골드 대비 배수
export const ENHANCE_STEPS: ({ rate: number; cube: number; goldMultiplier: number } | null)[] = [
  null,
  { rate: 1.0, cube: 10, goldMultiplier: 1 }, //   0 → 1
  { rate: 1.0, cube: 20, goldMultiplier: 1 }, //   1 → 2
  { rate: 1.0, cube: 30, goldMultiplier: 1 }, //   2 → 3
  { rate: 1.0, cube: 40, goldMultiplier: 1 }, //   3 → 4
  { rate: 0.8, cube: 50, goldMultiplier: 2 }, //   4 → 5
  { rate: 0.7, cube: 60, goldMultiplier: 2.2 }, // 5 → 6
  { rate: 0.6, cube: 70, goldMultiplier: 2.4 }, // 6 → 7
  { rate: 0.5, cube: 80, goldMultiplier: 2.6 }, // 7 → 8
  { rate: 0.4, cube: 90, goldMultiplier: 2.8 }, // 8 → 9
  { rate: 0.3, cube: 100, goldMultiplier: 3 }, //  9 → 10
  { rate: 0.25, cube: 120, goldMultiplier: 3 }, // 10 → 11
  { rate: 0.15, cube: 140, goldMultiplier: 5 }, // 11 → 12
  { rate: 0.14, cube: 160, goldMultiplier: 16 }, // 12 → 13
  { rate: 0.13, cube: 180, goldMultiplier: 24 }, // 13 → 14
  { rate: 0.12, cube: 200, goldMultiplier: 34 }, // 14 → 15
  { rate: 0.11, cube: 220, goldMultiplier: 46 }, // 15 → 16
  { rate: 0.1, cube: 240, goldMultiplier: 60 }, //  16 → 17
  { rate: 0.1, cube: 260, goldMultiplier: 64 }, //  17 → 18
];

// 목표 강화 수치 1회 시도 비용
// (일반 강화는 실패해도 성공 확률 보정치가 없음. 출처 본문의 11·12강 보정치 서술은 현재 게임과 달라 적용하지 않음)
export function enhanceAttemptCost(target: number, part: EnhancePart) {
  const step = ENHANCE_STEPS[target];
  if (!step) throw new Error(`지원하지 않는 강화 단계: +${target}`);
  return { gold: Math.round(ENHANCE_BASE_GOLD[part] * step.goldMultiplier), cube: step.cube, rate: step.rate };
}

// 강화 실패 시 결과 (같은 문서 본문 기준)
//   "0강에서 9강 장비까지는 강화에 실패하여도 기존 강화 수치가 내려가지 않지만"
//   "11강과 12강 시도 시 강화에 실패할 경우 기존 강화 수치가 3단계 감소한다."
//   "무기를 제외한 장비들은 11강 시도부터 강화에 실패할 경우 장비가 파괴된다."
//   "13강 시도부터는 강화에 실패할 경우 장비가 파괴되며" (장비 보호권 사용 시 보호권 소모 + 강화 수치 초기화)
export type EnhanceFailure =
  | { type: 'keep' } // 강화 수치 유지
  | { type: 'down'; levels: number } // 강화 수치 하락
  | { type: 'destroy' }; // 장비 파괴 (보호권 사용 시 0강으로 초기화)

export const ENHANCE_DOWN_LEVELS = 3; // 무기 11·12강 시도 실패 시 하락 단계
export const ENHANCE_DESTROY_FROM: Record<EnhancePart, number> = {
  weapon: 13, // 13강 시도부터 파괴
  armor: 11, // 무기 외 장비는 11강 시도부터 파괴
};

// 목표 강화 수치 시도에 실패했을 때의 결과
export function enhanceFailure(target: number, part: EnhancePart): EnhanceFailure {
  if (!ENHANCE_STEPS[target]) throw new Error(`지원하지 않는 강화 단계: +${target}`);
  if (target >= ENHANCE_DESTROY_FROM[part]) return { type: 'destroy' };
  if (target >= 11) return { type: 'down', levels: ENHANCE_DOWN_LEVELS };
  return { type: 'keep' };
}

// ─── 기댓값 계산기용 단계별 표 (/api/cost) ────────────────────────────────────
// 계산기는 이 표를 받아 그대로 시뮬레이션한다. 증폭 데이터가 정리되면 COST_TABLES 에 추가.
export interface CostStep {
  target: number; // 목표 수치
  rate: number; // 기본 성공 확률 (0~1)
  gold: number;
  material: number;
  fail: 'keep' | `down${number}` | 'destroy';
  failBonus: number; // 실패할 때마다 누적되는 성공 확률 (그 단계 성공 시 초기화)
}

export interface CostTable {
  material: string;
  maxLevel: number;
  parts: { id: string; label: string; steps: CostStep[] }[];
}

const ENHANCE_PARTS: { id: EnhancePart; label: string }[] = [
  { id: 'weapon', label: '무기' },
  { id: 'armor', label: '방어구·악세서리·특수장비' },
];

function enhanceCostTable(): CostTable {
  const maxLevel = ENHANCE_STEPS.length - 1;
  return {
    material: '무색 큐브 조각',
    maxLevel,
    parts: ENHANCE_PARTS.map(({ id, label }) => ({
      id,
      label,
      steps: Array.from({ length: maxLevel }, (_, i): CostStep => {
        const target = i + 1;
        const cost = enhanceAttemptCost(target, id);
        const failure = enhanceFailure(target, id);
        return {
          target,
          rate: cost.rate,
          gold: cost.gold,
          material: cost.cube,
          fail: failure.type === 'down' ? `down${failure.levels}` : failure.type,
          failBonus: 0, // 일반 강화는 실패 시 보정치 없음
        };
      }),
    })),
  };
}

function safeEnhanceCostTable(): CostTable {
  return {
    material: SAFE_ENHANCE_MATERIAL,
    maxLevel: SAFE_ENHANCE_MAX_LEVEL,
    parts: [
      {
        id: 'weapon',
        label: '무기',
        steps: Array.from({ length: SAFE_ENHANCE_MAX_LEVEL }, (_, i): CostStep => {
          const target = i + 1;
          const step = SAFE_ENHANCE_STEPS[target]!;
          return { target, rate: step.rate, gold: step.gold, material: step.core, fail: 'keep', failBonus: step.failBonus };
        }),
      },
    ],
  };
}

function amplifyCostTable(): CostTable {
  return {
    material: AMPLIFY_MATERIAL,
    maxLevel: AMPLIFY_MAX_LEVEL,
    parts: ENHANCE_PARTS.map(({ id, label }) => ({
      id,
      label,
      steps: Array.from({ length: AMPLIFY_MAX_LEVEL }, (_, i): CostStep => {
        const target = i + 1;
        const step = AMPLIFY_STEPS[target]!;
        return { target, rate: step.rate, gold: AMPLIFY_GOLD[id], material: step.crystal, fail: step.fail, failBonus: 0 };
      }),
    })),
  };
}

function safeAmplifyCostTable(): CostTable {
  return {
    material: SAFE_AMPLIFY_MATERIAL,
    maxLevel: SAFE_AMPLIFY_MAX_LEVEL,
    parts: ENHANCE_PARTS.map(({ id, label }) => ({
      id,
      label,
      steps: Array.from({ length: SAFE_AMPLIFY_MAX_LEVEL }, (_, i): CostStep => {
        const target = i + 1;
        const step = SAFE_AMPLIFY_STEPS[target]!;
        const cost = step[id];
        return { target, rate: step.rate, gold: cost.gold, material: cost.crystal, fail: 'keep', failBonus: step.failBonus };
      }),
    })),
  };
}

export const COST_TABLES: Partial<Record<'enhance' | 'safe' | 'amplify' | 'safe-amplify', () => CostTable>> = {
  enhance: enhanceCostTable,
  safe: safeEnhanceCostTable,
  amplify: amplifyCostTable,
  'safe-amplify': safeAmplifyCostTable,
};

// 실패 결과를 반영한 강화 수치 (current → target 시도 실패 후). 파괴는 보호권 사용을 가정해 0
export function enhanceLevelAfterFailure(current: number, part: EnhancePart, useProtection = true) {
  const result = enhanceFailure(current + 1, part);
  if (result.type === 'keep') return current;
  if (result.type === 'down') return Math.max(0, current - result.levels);
  return useProtection ? 0 : null; // null = 장비 파괴
}

// ─── 안전 강화 ─────────────────────────────────────────────────────────────────
// 출처: 나무위키 「던전앤파이터/강화」 2.1 안전 강화 (2026-10-23 판)
//   "무기 아이템에 한하여 +12강화까지 수치 하락 없이 강화할 수 있는 시스템입니다."
//   "안전 강화 시 골드와 라이언 코어가 소모됩니다."
//   가능 조건: 무기 아이템, 장착 레벨 제한 100Lv 이상, 유니크 이상 레어리티, +11 강화 이하 상태
//   "일반 강화에 비해 초기 성공 확률이 낮고 1회 시도 비용은 소폭 비싼 편이나
//    실패 시 지속적으로 보정 확률이 누적되어 성공 확률이 올라갑니다."
// 실패 시: 강화 수치 유지 (하락·파괴 없음)
// ⚠️ 보정치의 상한, 성공 시 초기화 여부는 출처에 없음.
//    "단계별로 누적, 그 단계 성공 시 초기화, 성공 확률 100% 상한"으로 가정.

export const SAFE_ENHANCE_MATERIAL = '라이언 코어';
export const SAFE_ENHANCE_MAX_LEVEL = 12;

// 인덱스 = 목표 강화 수치 (예: SAFE_ENHANCE_STEPS[11] 은 +10 → +11 시도)
//   rate: 기본 성공 확률, core: 라이언 코어 소모량, gold: 골드, failBonus: 실패할 때마다 누적되는 확률 보정(%p)
export const SAFE_ENHANCE_STEPS: ({ rate: number; core: number; gold: number; failBonus: number } | null)[] = [
  null,
  { rate: 1.0, core: 40, gold: 124_448, failBonus: 0 }, //       0 → 1
  { rate: 1.0, core: 41, gold: 124_448, failBonus: 0 }, //       1 → 2
  { rate: 1.0, core: 43, gold: 124_448, failBonus: 0 }, //       2 → 3
  { rate: 1.0, core: 44, gold: 124_448, failBonus: 0 }, //       3 → 4
  { rate: 0.8, core: 81, gold: 247_893, failBonus: 0.05 }, //    4 → 5
  { rate: 0.7, core: 91, gold: 276_207, failBonus: 0.05 }, //    5 → 6
  { rate: 0.6, core: 99, gold: 298_734, failBonus: 0.05 }, //    6 → 7
  { rate: 0.5, core: 110, gold: 332_572, failBonus: 0.05 }, //   7 → 8
  { rate: 0.4, core: 124, gold: 377_149, failBonus: 0.05 }, //   8 → 9
  { rate: 0.3, core: 145, gold: 436_960, failBonus: 0.05 }, //   9 → 10
  { rate: 0.1, core: 491, gold: 1_485_598, failBonus: 0.02 }, // 10 → 11
  { rate: 0.06, core: 1_529, gold: 4_626_036, failBonus: 0.02 }, // 11 → 12
];

// 목표 강화 수치 1회 시도 비용. failures = 이 단계에서 지금까지 연속 실패한 횟수 (보정치 누적)
export function safeEnhanceAttemptCost(target: number, failures = 0) {
  const step = SAFE_ENHANCE_STEPS[target];
  if (!step) throw new Error(`지원하지 않는 안전 강화 단계: +${target}`);
  return {
    gold: step.gold,
    core: step.core,
    rate: Math.min(1, step.rate + step.failBonus * failures),
  };
}

// ─── 증폭 ──────────────────────────────────────────────────────────────────────
// 출처: 나무위키 「던전앤파이터/강화」 증폭 (2026-10-23 판). 확률은 2021-12-02 패치 공개 기준, 골드는 100레벨 에픽 기준.
//   대상: 차원의 능력(이계의 기운을 정화한 능력치)이 있는 무기·방어구·악세서리·특수장비
//   "강화와는 달리 5증 도전부터 실패시 증폭 수치가 감소하며 11증 도전부터는 실패 시 파괴되고 보정치도 없다."
//   골드: "무기 : 739,200 , 무기 이외의 장비 258,720"
// ⚠️ 골드는 단계별 값이 따로 없어 1회 시도마다 고정으로 가정. 실패 시 확률 보정치는 일반 강화처럼 없음으로 처리.

export const AMPLIFY_MATERIAL = '모순의 결정체';
export const AMPLIFY_MAX_LEVEL = 13; // 출처 표 기준 13증까지

// 1회 시도 골드 (단계 무관)
export const AMPLIFY_GOLD: Record<EnhancePart, number> = {
  weapon: 739_200,
  armor: 258_720,
};

// 인덱스 = 목표 증폭 수치 (예: AMPLIFY_STEPS[8] 은 +7 → +8 시도)
//   rate: 성공 확률, crystal: 모순의 결정체 소모량, fail: 실패 시 결과 (출처 표의 실패 페널티)
//     keep = 유지, downN = N단계 하락, destroy = 파괴 (증폭 보호권 사용 시 파괴 방지)
export const AMPLIFY_STEPS: ({ rate: number; crystal: number; fail: CostStep['fail'] } | null)[] = [
  null,
  { rate: 1.0, crystal: 1, fail: 'keep' }, //     0 → 1
  { rate: 1.0, crystal: 2, fail: 'keep' }, //     1 → 2
  { rate: 1.0, crystal: 3, fail: 'keep' }, //     2 → 3
  { rate: 1.0, crystal: 4, fail: 'keep' }, //     3 → 4
  { rate: 0.8, crystal: 5, fail: 'down1' }, //    4 → 5  (실패 시 +4 → +3)
  { rate: 0.7, crystal: 6, fail: 'down1' }, //    5 → 6  (+5 → +4)
  { rate: 0.6, crystal: 7, fail: 'down1' }, //    6 → 7  (+6 → +5)
  { rate: 0.7, crystal: 8, fail: 'down3' }, //    7 → 8  (+7 → +4)
  { rate: 0.6, crystal: 9, fail: 'down3' }, //    8 → 9  (+8 → +5)
  { rate: 0.5, crystal: 10, fail: 'down3' }, //   9 → 10 (+9 → +6)
  { rate: 0.4, crystal: 11, fail: 'destroy' }, // 10 → 11
  { rate: 0.3, crystal: 12, fail: 'destroy' }, // 11 → 12
  { rate: 0.2, crystal: 13, fail: 'destroy' }, // 12 → 13
];

// ─── 안전 증폭 ─────────────────────────────────────────────────────────────────
// 출처: 나무위키 「던전앤파이터/강화」 안전 증폭 (2026-10-23 판), 시즌 8 패치로 추가
//   "+10 증폭까지 수치 하락 없이 증폭할 수 있는 시스템입니다."
//   "안전 증폭 시 골드와 조화의 결정체가 소모됩니다."
//   가능 조건: 장착 레벨 제한 100Lv 이상, 유니크 이상 레어리티, +9 증폭 이하 상태
//   "일반 증폭에 비해 초기 성공 확률이 낮고 1회 시도 비용은 소폭 비싼 편이나
//    실패 시 지속적으로 보정 확률이 누적되어 성공 확률이 올라갑니다."
// 실패 시: 증폭 수치 유지 (하락·파괴 없음)
// ⚠️ 보정치의 상한, 성공 시 초기화 여부는 출처에 없음. 안전 강화와 같이
//    "단계별로 누적, 그 단계 성공 시 초기화, 성공 확률 100% 상한"으로 가정.

export const SAFE_AMPLIFY_MATERIAL = '조화의 결정체';
export const SAFE_AMPLIFY_MAX_LEVEL = 10;

// 인덱스 = 목표 증폭 수치 (예: SAFE_AMPLIFY_STEPS[5] 는 +4 → +5 시도)
//   rate: 기본 성공 확률, failBonus: 실패할 때마다 누적되는 확률 보정(%p)
//   weapon / armor: 부위별 { crystal: 조화의 결정체, gold: 골드 } (armor = 무기 외 장비)
type SafeAmplifyCost = { crystal: number; gold: number };
export const SAFE_AMPLIFY_STEPS: ({ rate: number; failBonus: number; weapon: SafeAmplifyCost; armor: SafeAmplifyCost } | null)[] = [
  null,
  { rate: 1.0, failBonus: 0, weapon: { crystal: 36, gold: 430_100 }, armor: { crystal: 16, gold: 189_860 } }, //         0 → 1
  { rate: 1.0, failBonus: 0, weapon: { crystal: 41, gold: 490_600 }, armor: { crystal: 21, gold: 250_360 } }, //         1 → 2
  { rate: 1.0, failBonus: 0, weapon: { crystal: 46, gold: 551_100 }, armor: { crystal: 26, gold: 310_860 } }, //         2 → 3
  { rate: 1.0, failBonus: 0, weapon: { crystal: 51, gold: 611_600 }, armor: { crystal: 31, gold: 371_360 } }, //         3 → 4
  { rate: 0.7, failBonus: 0.1, weapon: { crystal: 55, gold: 876_652 }, armor: { crystal: 46, gold: 490_750 } }, //       4 → 5
  { rate: 0.6, failBonus: 0.1, weapon: { crystal: 67, gold: 1_072_098 }, armor: { crystal: 58, gold: 615_450 } }, //     5 → 6
  { rate: 0.5, failBonus: 0.1, weapon: { crystal: 109, gold: 1_730_400 }, armor: { crystal: 98, gold: 1_043_132 } }, //  6 → 7
  { rate: 0.5, failBonus: 0.05, weapon: { crystal: 122, gold: 1_932_679 }, armor: { crystal: 109, gold: 1_157_283 } }, // 7 → 8
  { rate: 0.4, failBonus: 0.05, weapon: { crystal: 230, gold: 3_656_400 }, armor: { crystal: 212, gold: 2_246_200 } }, // 8 → 9
  { rate: 0.3, failBonus: 0.05, weapon: { crystal: 320, gold: 5_084_870 }, armor: { crystal: 277, gold: 2_937_440 } }, // 9 → 10
];