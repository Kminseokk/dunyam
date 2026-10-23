// 통계 페이지 데이터. 저장된 전체 캐릭터 기준.
export const STAT_TYPES = ['server', 'job', 'fame', 'dundam'] as const;
export type StatType = (typeof STAT_TYPES)[number];

const FAME_BUCKET = 5000;
const dundamNumber = (unit: string) => `CAST(REPLACE(dundam, '${unit}', '') AS INTEGER)`;

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
  dundam: {
    rows: `SELECT job_grow_name, COUNT(*) AS count, ROUND(AVG(${dundamNumber('억')})) AS avg_value,
        MAX(${dundamNumber('억')}) AS max_value
      FROM characters WHERE dundam LIKE '%억' GROUP BY job_grow_name ORDER BY avg_value DESC`,
    buffers: `SELECT job_grow_name, COUNT(*) AS count, ROUND(AVG(${dundamNumber('만')})) AS avg_value,
        MAX(${dundamNumber('만')}) AS max_value
      FROM characters WHERE dundam LIKE '%만' GROUP BY job_grow_name ORDER BY avg_value DESC`,
    summary: `SELECT COUNT(*) AS characters, SUM(dundam LIKE '%억') AS dealers, SUM(dundam LIKE '%만') AS buffers
      FROM characters WHERE dundam LIKE '%억' OR dundam LIKE '%만'`,
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
