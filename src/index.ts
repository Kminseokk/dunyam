import { COST_TABLES } from './cost';
// import { getDundamValue } from './dundam'; // 던담 정보 갱신 (사용 중지)
import {
  CharacterBase,
  CharacterDetail,
  MikaelaState,
  NeopleError,
  getCharacter,
  SERVER_IDS,
  UPGRADE_MAX_DAYS,
  UPGRADE_START,
  getCharacterDetail,
  getSpec,
  getUpgradeRecords,
  getWeeklyClears,
  kstDaysBetween,
  nowKst,
  searchCharacters,
} from './neople';
import { MIN_FAME } from './rules';
import { RANK_TYPES, RankType, getRanking, rankingQuery, refreshAdventureStatements } from './ranking';
import { STAT_TYPES, StatType, getStatistics } from './statistics';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  NEOPLE_API_KEY: string;
}

const FALLBACK_IMAGE = '/image_class/20240111_update_2.webp';
const COMING_SOON = ['/guild'];
const CALCULATOR_TYPES = ['enhance', 'safe', 'amplify', 'safe-amplify'] as const;

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (message: string, status = 400) => json({ ok: false, message }, status);

class BadRequest extends Error {}

function text(body: Record<string, unknown>, key: string, max = 32) {
  const value = typeof body[key] === 'string' ? (body[key] as string).trim() : '';
  if (!value || value.length > max) throw new BadRequest(`${key} 값이 올바르지 않습니다.`);
  return value;
}

// 캐릭터 저장 + 모험단 요약 갱신을 한 batch(트랜잭션)로 실행
async function saveCharacter(db: D1Database, adventure: string, c: CharacterDetail) {
  const upsert = db
    .prepare(
      `INSERT INTO characters (
        adventure_name, character_uid, server_id, character_name, job_id, job_grow_id, job_name, job_grow_name,
        fame, enchant, queen_creature, fashionista_aurora, title,
        mikaela_hard_count, mikaela_base, mikaela_cutoff
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
      ON CONFLICT (adventure_name, character_uid) DO UPDATE SET
        server_id = excluded.server_id, character_name = excluded.character_name,
        job_id = excluded.job_id, job_grow_id = excluded.job_grow_id,
        job_name = excluded.job_name, job_grow_name = excluded.job_grow_name,
        fame = excluded.fame,
        enchant = excluded.enchant, queen_creature = excluded.queen_creature,
        fashionista_aurora = excluded.fashionista_aurora, title = excluded.title,
        mikaela_hard_count = COALESCE(excluded.mikaela_hard_count, mikaela_hard_count),
        mikaela_base = COALESCE(excluded.mikaela_base, mikaela_base),
        mikaela_cutoff = COALESCE(excluded.mikaela_cutoff, mikaela_cutoff),
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      adventure, c.characterId, c.serverId, c.characterName, c.jobId, c.jobGrowId, c.jobName, c.jobGrowName,
      c.fame, c.enchant, c.queenCreature, c.fashionistaAurora, c.title,
      c.mikaelaHardCount, c.mikaelaBase, c.mikaelaCutoff,
    );
  await db.batch([upsert, ...refreshAdventureStatements(db, adventure)]);
}

// 저장된 미카엘라 누적 상태 (처음 등록이면 출시일부터 센다)
async function mikaelaState(db: D1Database, adventure: string, uid: string): Promise<MikaelaState> {
  const row = await db
    .prepare(`SELECT mikaela_base, mikaela_cutoff FROM characters WHERE adventure_name = ?1 AND character_uid = ?2`)
    .bind(adventure, uid)
    .first<{ mikaela_base: number | null; mikaela_cutoff: string | null }>();
  return row?.mikaela_cutoff ? { base: row.mikaela_base ?? 0, cutoff: row.mikaela_cutoff } : { base: 0, cutoff: null };
}

async function deleteCharacter(db: D1Database, adventure: string, uid: string) {
  const del = db.prepare(`DELETE FROM characters WHERE adventure_name = ?1 AND character_uid = ?2`).bind(adventure, uid);
  await db.batch([del, ...refreshAdventureStatements(db, adventure)]);
}

// 집계 API 응답을 Cloudflare 엣지에 캐시. 방문자 수와 관계없이 DB는 ttl 마다 한 번만 읽는다.
// (엣지 캐시는 ttl, 브라우저 캐시는 60초)
// 캐시에서 꺼낸 응답을 그대로 돌려주면 도메인의 브라우저 캐시 TTL(기본 4시간)로 덮어써지므로 새 응답으로 감싼다.
async function edgeCached(request: Request, ctx: ExecutionContext, ttl: number, produce: () => Promise<Response>) {
  const cache = caches.default;
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  const toClient = (body: string) =>
    new Response(body, { headers: { ...headers, 'Cache-Control': `public, max-age=${Math.min(ttl, 60)}` } });

  const hit = await cache.match(request);
  if (hit) return toClient(await hit.text());

  const res = await produce();
  if (!res.ok) return res;
  const body = await res.text();
  ctx.waitUntil(
    cache.put(request, new Response(body, { headers: { ...headers, 'Cache-Control': `public, max-age=${ttl}` } })),
  );
  return toClient(body);
}

const RANKING_TTL = 300;
const STATISTICS_TTL = 3600;
const COST_TTL = 600; // cost.ts 는 배포 때만 바뀜

// 캐릭터가 바뀌면 이 데이터센터의 명예의 전당·랭킹 캐시를 비움 (다른 데이터센터는 ttl 후 갱신)
function purgeRankingCache(request: Request, ctx: ExecutionContext) {
  const origin = new URL(request.url).origin;
  const urls = [`${origin}/api/highlights`, ...RANK_TYPES.map((t) => `${origin}/api/ranking?type=${t}`)];
  ctx.waitUntil(Promise.all(urls.map((u) => caches.default.delete(new Request(u)))));
}

// 이름으로 캐릭터를 찾아 해당 모험단 소속인 캐릭터를 반환.
// 이미 등록된 캐릭터들의 서버를 먼저 찾고(보통 2회 호출), 없을 때만 전 서버를 검색한다.
async function findMember(env: Env, adventure: string, name: string) {
  const key = env.NEOPLE_API_KEY;
  const { results } = await env.DB.prepare(
    `SELECT server_id FROM characters WHERE adventure_name = ?1 GROUP BY server_id ORDER BY COUNT(*) DESC`,
  )
    .bind(adventure)
    .all<{ server_id: string }>();
  const knownServers = results.map((r) => r.server_id);

  // 모험단 이름은 전 서버에서 유일하므로 소속 캐릭터는 최대 1명
  const pickMember = async (found: CharacterBase[]) => {
    const candidates = await Promise.all(found.map((c) => getCharacter(key, c.serverId, c.characterId)));
    return candidates.find((c) => c.adventureName === adventure) ?? null;
  };

  if (knownServers.length) {
    const found = (await Promise.all(knownServers.map((s) => searchCharacters(key, s, name)))).flat();
    const member = await pickMember(found);
    if (member) return member;
  }

  // 등록된 서버에 없으면 전 서버 검색 (이미 확인한 서버는 제외)
  const found = await searchCharacters(key, 'all', name);
  return pickMember(found.filter((c) => !knownServers.includes(c.serverId)));
}

// 등록 가능 여부. 불가능하면 사유 메시지를 반환
function registrationError(member: CharacterBase | null) {
  if (!member) return '해당 모험단에 속한 캐릭터가 아닙니다.';
  if ((member.fame ?? 0) < MIN_FAME) {
    return `명성 ${MIN_FAME.toLocaleString()} 이상인 캐릭터만 등록할 수 있습니다. (현재 ${(member.fame ?? 0).toLocaleString()})`;
  }
  return null;
}

async function representativeImage(env: Env, request: Request, jobId?: string, jobGrowId?: string) {
  if (!jobId || !jobGrowId) return FALLBACK_IMAGE;
  const path = `/image_class/${jobId}/${jobGrowId}.webp`;
  const res = await env.ASSETS.fetch(new Request(new URL(path, request.url), { method: 'HEAD' }));
  return res.ok ? path : FALLBACK_IMAGE;
}

async function getAdventure(env: Env, request: Request, adventure: string) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM characters WHERE adventure_name = ?1 ORDER BY fame DESC, character_name`,
  )
    .bind(adventure)
    .all<Record<string, any>>();

  const sum = (key: string) => results.reduce((acc, row) => acc + (row[key] ?? 0), 0);
  const fameSum = sum('fame');
  const top = results[0];

  return json({
    ok: true,
    adventure,
    characters: results,
    representative: top ?? null,
    imagePath: await representativeImage(env, request, top?.job_id, top?.job_grow_id),
    fameSum,
    fameAvg: results.length ? Math.round(fameSum / results.length) : 0,
    mikaelaHardSum: sum('mikaela_hard_count'),
  });
}

// 메인 화면 업적 카드: 저장된 전체 캐릭터 기준 1위
async function getHighlights(env: Env) {
  const queries = {
    topFame: `SELECT adventure_name, character_name, server_id, job_grow_name, fame FROM characters
      ORDER BY fame DESC LIMIT 1`,
    // 모험단 기준 카드는 랭킹 페이지와 같은 쿼리의 1위
    topFameSum: rankingQuery('fame-sum', 1),
    topFameAvg: rankingQuery('fame-avg', 1),
    topMikaela: rankingQuery('mikaela', 1),
    topCount: rankingQuery('count', 1),
  };
  const keys = Object.keys(queries) as (keyof typeof queries)[];
  const results = await env.DB.batch(keys.map((key) => env.DB.prepare(queries[key])));
  const highlights = Object.fromEntries(keys.map((key, i) => [key, results[i].results[0] ?? null]));

  return Response.json({ ok: true, ...highlights });
}

async function api(request: Request, env: Env, path: string, ctx: ExecutionContext) {
  if (request.method === 'GET' && path === '/api/highlights') {
    return edgeCached(request, ctx, RANKING_TTL, () => getHighlights(env));
  }

  if (request.method === 'GET' && path === '/api/ranking') {
    const type = new URL(request.url).searchParams.get('type') as RankType;
    if (!RANK_TYPES.includes(type)) throw new BadRequest('type 값이 올바르지 않습니다.');
    return edgeCached(request, ctx, RANKING_TTL, () => getRanking(env.DB, type));
  }

  if (request.method === 'GET' && path === '/api/statistics') {
    const type = new URL(request.url).searchParams.get('type') as StatType;
    if (!STAT_TYPES.includes(type)) throw new BadRequest('type 값이 올바르지 않습니다.');
    return edgeCached(request, ctx, STATISTICS_TTL, () => getStatistics(env.DB, type));
  }

  // 기댓값 계산기 단계별 확률·비용 (src/cost.ts)
  if (request.method === 'GET' && path === '/api/cost') {
    const type = new URL(request.url).searchParams.get('type') as (typeof CALCULATOR_TYPES)[number];
    if (!CALCULATOR_TYPES.includes(type)) throw new BadRequest('type 값이 올바르지 않습니다.');
    const table = COST_TABLES[type];
    if (!table) return fail('아직 준비 중인 데이터입니다.', 404);
    return edgeCached(request, ctx, COST_TTL, async () => json({ ok: true, type, ...table() }));
  }

  // 강화/증폭 기록·스펙체크: 서버 + 캐릭터 이름으로 캐릭터 찾기
  if (request.method === 'GET' && path === '/api/record/character') {
    const params = new URL(request.url).searchParams;
    const server = params.get('server') ?? '';
    if (!SERVER_IDS.includes(server)) throw new BadRequest('server 값이 올바르지 않습니다.');
    const name = text({ name: params.get('name') }, 'name');
    const found = (await searchCharacters(env.NEOPLE_API_KEY, server, name))[0];
    if (!found) return json({ ok: false, message: '캐릭터를 찾을 수 없습니다.' });
    const c = await getCharacter(env.NEOPLE_API_KEY, server, found.characterId);
    return json({ ok: true, character: c, start: UPGRADE_START, maxDays: UPGRADE_MAX_DAYS });
  }

  // 스펙체크: 캐릭터 스펙 요약 (네오플 API 5회)
  if (request.method === 'GET' && path === '/api/spec') {
    const params = new URL(request.url).searchParams;
    const server = params.get('server') ?? '';
    const id = params.get('id') ?? '';
    if (!SERVER_IDS.includes(server)) throw new BadRequest('server 값이 올바르지 않습니다.');
    if (!/^[0-9a-f]{32}$/.test(id)) throw new BadRequest('id 값이 올바르지 않습니다.');
    return json({ ok: true, spec: await getSpec(env.NEOPLE_API_KEY, server, id) });
  }

  // 강화/증폭 기록: 구간 하나(최대 UPGRADE_MAX_DAYS 일). 브라우저가 구간을 나눠 차례로 요청한다
  if (request.method === 'GET' && path === '/api/record/timeline') {
    const params = new URL(request.url).searchParams;
    const server = params.get('server') ?? '';
    const id = params.get('id') ?? '';
    const start = params.get('start') ?? '';
    const datePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
    // 브라우저 시계가 조금 빠르면 끝 시각이 미래일 수 있어 지금으로 맞춘다 (미래 시각은 타임라인 API 오류)
    const now = nowKst();
    const end = [params.get('end') ?? '', now].sort()[0]!;
    if (!SERVER_IDS.includes(server)) throw new BadRequest('server 값이 올바르지 않습니다.');
    if (!/^[0-9a-f]{32}$/.test(id)) throw new BadRequest('id 값이 올바르지 않습니다.');
    if (!datePattern.test(start) || !datePattern.test(end) || start < UPGRADE_START || start >= end) {
      throw new BadRequest('기간이 올바르지 않습니다.');
    }
    if (kstDaysBetween(start, end) > UPGRADE_MAX_DAYS) throw new BadRequest('기간은 최대 89일입니다.');
    const records = await getUpgradeRecords(env.NEOPLE_API_KEY, server, id, start, end, params.get('last') === '1');
    return json({ ok: true, records });
  }

  if (request.method === 'GET' && path === '/api/adventure') {
    const adventure = text({ name: new URL(request.url).searchParams.get('name') }, 'name');
    return getAdventure(env, request, adventure);
  }

  if (request.method !== 'POST') return fail('Not Found', 404);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const adventure = text(body, 'adventure');

  switch (path) {
    // 캐릭터가 모험단 소속인지 확인
    case '/api/check': {
      const member = await findMember(env, adventure, text(body, 'name'));
      const error = registrationError(member);
      return json(error ? { ok: false, message: error } : { ok: true, server: member?.serverId });
    }

    // 모험단에 캐릭터 추가
    case '/api/save': {
      const member = await findMember(env, adventure, text(body, 'name'));
      const error = registrationError(member);
      if (error || !member) return json({ ok: false, message: error });
      const mikaela = await mikaelaState(env.DB, adventure, member.characterId);
      await saveCharacter(env.DB, adventure, await getCharacterDetail(env.NEOPLE_API_KEY, member, mikaela));
      purgeRankingCache(request, ctx);
      return json({ ok: true });
    }

    // 저장된 캐릭터 1명 갱신 (닉네임 변경 반영, 삭제된 캐릭터 제거)
    case '/api/refresh': {
      const uid = text(body, 'uid', 64);
      const row = await env.DB.prepare(
        `SELECT server_id FROM characters WHERE adventure_name = ?1 AND character_uid = ?2`,
      )
        .bind(adventure, uid)
        .first<{ server_id: string }>();
      if (!row) return fail('저장된 캐릭터가 아닙니다.', 404);

      let base;
      try {
        base = await getCharacter(env.NEOPLE_API_KEY, row.server_id, uid);
      } catch (e) {
        if (!(e instanceof NeopleError && e.status === 404)) throw e;
        await deleteCharacter(env.DB, adventure, uid);
        purgeRankingCache(request, ctx);
        return json({ ok: true, deleted: true });
      }
      if (base.adventureName !== adventure) return json({ ok: false, message: '모험단이 변경된 캐릭터입니다.' });
      const mikaela = await mikaelaState(env.DB, adventure, uid);
      await saveCharacter(env.DB, adventure, await getCharacterDetail(env.NEOPLE_API_KEY, base, mikaela));
      purgeRankingCache(request, ctx);
      return json({ ok: true });
    }

    // 스케줄러: 캐릭터 1명의 이번 주 레이드·레기온 클리어 기록 갱신
    case '/api/clears': {
      const uid = text(body, 'uid', 64);
      const row = await env.DB.prepare(
        `SELECT server_id FROM characters WHERE adventure_name = ?1 AND character_uid = ?2`,
      )
        .bind(adventure, uid)
        .first<{ server_id: string }>();
      if (!row) return fail('저장된 캐릭터가 아닙니다.', 404);

      const weekly = await getWeeklyClears(env.NEOPLE_API_KEY, row.server_id, uid);
      await env.DB.prepare(
        `UPDATE characters SET clears = ?1, clears_updated_at = CURRENT_TIMESTAMP
        WHERE adventure_name = ?2 AND character_uid = ?3`,
      )
        .bind(JSON.stringify(weekly), adventure, uid)
        .run();
      return json({ ok: true });
    }

    // 던담 수치 갱신 (사용 중지: characters.dundam 컬럼 삭제됨, src/dundam.ts 참고)
    // case '/api/dundam': {
    //   const uid = text(body, 'uid', 64);
    //   const row = await env.DB.prepare(
    //     `SELECT server_id FROM characters WHERE adventure_name = ?1 AND character_uid = ?2`,
    //   )
    //     .bind(adventure, uid)
    //     .first<{ server_id: string }>();
    //   if (!row) return fail('저장된 캐릭터가 아닙니다.', 404);
    //
    //   const value = await getDundamValue(row.server_id, uid);
    //   if (!value) return json({ ok: false, message: '던담 정보를 찾을 수 없습니다.' });
    //   await env.DB.prepare(`UPDATE characters SET dundam = ?1 WHERE adventure_name = ?2 AND character_uid = ?3`)
    //     .bind(value, adventure, uid)
    //     .run();
    //   purgeRankingCache(request, ctx);
    //   return json({ ok: true, value });
    // }
  }
  return fail('Not Found', 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(request, env, url.pathname, ctx);
      } catch (e) {
        if (e instanceof BadRequest) return fail(e.message);
        console.error(e);
        return fail('서버 오류가 발생했습니다. 던전앤파이터 점검 시간에는 API 호출이 실패할 수 있습니다.', 502);
      }
    }

    // 준비 중인 페이지 (실제 페이지를 만들면 여기서 빼고 public/ 에 HTML 추가)
    if (COMING_SOON.includes(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL('/wait', url), request));
    }

    // 탭 페이지: /<페이지>/<탭> 은 모두 같은 HTML, /<페이지> 는 첫 탭으로
    const tabPages: Record<string, readonly string[]> = {
      rank: RANK_TYPES,
      statistics: STAT_TYPES,
      calculator: CALCULATOR_TYPES,
    };
    if (url.pathname === '/data') {
      return Response.redirect(new URL(`/statistics/${STAT_TYPES[0]}`, url).toString(), 301);
    }
    const [, page, tab] = url.pathname.match(/^\/(rank|statistics|calculator)(?:\/([a-z-]*))?\/?$/) ?? [];
    if (page && !tab) {
      return Response.redirect(new URL(`/${page}/${tabPages[page][0]}`, url).toString(), 301);
    }
    if (page && tabPages[page].includes(tab)) {
      return env.ASSETS.fetch(new Request(new URL(`/${page}`, url), request));
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
