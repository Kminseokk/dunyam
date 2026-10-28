// 통계 페이지 데이터. 저장된 전체 캐릭터 기준.
export const STAT_TYPES = ['server', 'job', 'fame'] as const;
export type StatType = (typeof STAT_TYPES)[number];

const FAME_BUCKET = 5000;

const QUERIES: Record<StatType, Record<string, string>> = {
  server: {
    rows: `SELECT server_id, COUNT(*) AS count, ROUND(AVG(fame)) AS avg_fame, MAX(fame) AS max_fame
      FROM characters GROUP BY server_id ORDER BY count DESC`,
    summary: `SELECT COUNT(*) AS characters, COUNT(DISTINCT adventure_name) AS adventures FROM characters`,
  },
  job: {
    rows: `SELECT job_name, job_grow_name, COUNT(*) AS count, ROUND(AVG(fame)) AS avg_fame, MAX(fame) AS max_fame
      FROM characters GROUP BY job_name, job_grow_name ORDER BY count DESC, avg_fame DESC`,
    summary: `SELECT COUNT(*) AS characters FROM characters`,
  },
  fame: {
    rows: `SELECT (fame / ${FAME_BUCKET}) * ${FAME_BUCKET} AS bucket, COUNT(*) AS count
      FROM characters WHERE fame IS NOT NULL GROUP BY bucket ORDER BY bucket`,
    summary: `SELECT COUNT(*) AS characters, ROUND(AVG(fame)) AS avg_fame, MAX(fame) AS max_fame, MIN(fame) AS min_fame
      FROM characters WHERE fame IS NOT NULL`,
  },
};

export async function getStatistics(db: D1Database, type: StatType) {
  const queries = QUERIES[type];
  const keys = Object.keys(queries);
  const results = await db.batch(keys.map((key) => db.prepare(queries[key])));
  const data: Record<string, unknown> = { ok: true, type, bucketSize: FAME_BUCKET };
  keys.forEach((key, i) => {
    data[key] = key === 'summary' ? results[i].results[0] : results[i].results;
  });
  return Response.json(data);
}
