// 모험단 랭킹. 메인 화면 명예의 전당도 같은 쿼리의 1위를 사용한다.
// 캐릭터 전체가 아니라 모험단 요약 테이블(adventures)을 읽는다.
export const RANK_TYPES = ['fame-sum', 'fame-avg', 'count', 'mikaela'] as const;
export type RankType = (typeof RANK_TYPES)[number];

// 평균 명성 랭킹은 캐릭터 7명 이하 모험단 제외
export const FAME_AVG_MIN_CHARACTERS = 8;
const RANK_LIMIT = 10;

// 정렬 순서는 migrations/0004 의 인덱스와 같아야 상위 N개만 읽는다
const RANK: Record<RankType, { order: string; value: string; where?: string }> = {
  'fame-sum': { value: 'fame_sum', order: 'fame_sum DESC, character_count' },
  'fame-avg': {
    value: 'fame_avg',
    order: 'fame_avg DESC, character_count',
    where: `character_count >= ${FAME_AVG_MIN_CHARACTERS}`,
  },
  count: { value: 'character_count', order: 'character_count DESC' },
  mikaela: { value: 'mikaela_sum', order: 'mikaela_sum DESC, character_count', where: 'mikaela_sum > 0' },
};

// 결과 컬럼: adventure_name, value, count, top_character(모험단 내 최고 명성 캐릭터)
export function rankingQuery(type: RankType, limit: number) {
  const { value, order, where } = RANK[type];
  return `SELECT adventure_name, ${value} AS value, character_count AS count, top_character
    FROM adventures ${where ? `WHERE ${where}` : ''} ORDER BY ${order} LIMIT ${limit}`;
}

export async function getRanking(db: D1Database, type: RankType) {
  const { results } = await db.prepare(rankingQuery(type, RANK_LIMIT)).all();
  return Response.json({ ok: true, type, minCharacters: FAME_AVG_MIN_CHARACTERS, rows: results });
}

// 캐릭터를 저장/삭제한 뒤 해당 모험단 요약을 다시 계산 (캐릭터 쿼리와 같은 batch 로 실행)
export function refreshAdventureStatements(db: D1Database, adventure: string) {
  return [
    db
      .prepare(
        `INSERT INTO adventures (adventure_name, character_count, fame_sum, fame_avg, mikaela_sum, top_character, updated_at)
        SELECT ?1, COUNT(*), SUM(fame), ROUND(AVG(fame)), SUM(mikaela_hard_count),
          (SELECT character_name FROM characters WHERE adventure_name = ?1 ORDER BY fame DESC LIMIT 1),
          CURRENT_TIMESTAMP
        FROM characters WHERE adventure_name = ?1 HAVING COUNT(*) > 0
        ON CONFLICT (adventure_name) DO UPDATE SET
          character_count = excluded.character_count, fame_sum = excluded.fame_sum, fame_avg = excluded.fame_avg,
          mikaela_sum = excluded.mikaela_sum, top_character = excluded.top_character, updated_at = excluded.updated_at`,
      )
      .bind(adventure),
    db
      .prepare(
        `DELETE FROM adventures WHERE adventure_name = ?1
          AND NOT EXISTS (SELECT 1 FROM characters WHERE adventure_name = ?1)`,
      )
      .bind(adventure),
  ];
}
