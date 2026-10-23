// 모험단 랭킹. 메인 화면 명예의 전당도 같은 쿼리의 1위를 사용한다.
export const RANK_TYPES = ['fame-sum', 'fame-avg', 'count', 'mikaela'] as const;
export type RankType = (typeof RANK_TYPES)[number];

// 평균 명성 랭킹은 캐릭터 7명 이하 모험단 제외
export const FAME_AVG_MIN_CHARACTERS = 8;
const RANK_LIMIT = 10;

const VALUE: Record<RankType, { value: string; having?: string }> = {
  'fame-sum': { value: 'SUM(fame)' },
  'fame-avg': { value: 'ROUND(AVG(fame))', having: `COUNT(*) >= ${FAME_AVG_MIN_CHARACTERS}` },
  count: { value: 'COUNT(*)' },
  mikaela: { value: 'SUM(mikaela_hard_count)', having: 'SUM(mikaela_hard_count) > 0' },
};

// 결과 컬럼: adventure_name, value, count, top_character(모험단 내 최고 명성 캐릭터)
export function rankingQuery(type: RankType, limit: number) {
  const { value, having } = VALUE[type];
  return `SELECT adventure_name, ${value} AS value, COUNT(*) AS count,
      (SELECT character_name FROM characters t WHERE t.adventure_name = c.adventure_name
        ORDER BY fame DESC LIMIT 1) AS top_character
    FROM characters c GROUP BY adventure_name ${having ? `HAVING ${having}` : ''}
    ORDER BY value DESC, count ASC LIMIT ${limit}`;
}

export async function getRanking(db: D1Database, type: RankType) {
  const { results } = await db.prepare(rankingQuery(type, RANK_LIMIT)).all();
  return Response.json(
    { ok: true, type, minCharacters: FAME_AVG_MIN_CHARACTERS, rows: results },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
