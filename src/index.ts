import { getDundamValue } from './dundam';
import { CharacterBase, CharacterDetail, NeopleError, getCharacter, getCharacterDetail, searchCharacters } from './neople';
import { MIN_FAME } from './rules';
import { RANK_TYPES, RankType, getRanking, rankingQuery } from './ranking';
import { STAT_TYPES, StatType, getStatistics } from './statistics';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  NEOPLE_API_KEY: string;
}

const FALLBACK_IMAGE = '/image_class/20240111_update_2.webp';
const COMING_SOON = ['/calculator', '/enhance', '/amplify', '/guild'];

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (message: string, status = 400) => json({ ok: false, message }, status);

class BadRequest extends Error {}

function text(body: Record<string, unknown>, key: string, max = 32) {
  const value = typeof body[key] === 'string' ? (body[key] as string).trim() : '';
  if (!value || value.length > max) throw new BadRequest(`${key} 값이 올바르지 않습니다.`);
  return value;
}

async function upsert(db: D1Database, adventure: string, c: CharacterDetail) {
  await db
    .prepare(
      `INSERT INTO characters (
        adventure_name, character_uid, server_id, character_name, job_id, job_grow_id, job_name, job_grow_name,
        item_level_sum, fame, enchant, queen_creature, fashionista_aurora, title, mikaela_hard_count
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
      ON CONFLICT (adventure_name, character_uid) DO UPDATE SET
        server_id = excluded.server_id, character_name = excluded.character_name,
        job_id = excluded.job_id, job_grow_id = excluded.job_grow_id,
        job_name = excluded.job_name, job_grow_name = excluded.job_grow_name,
        item_level_sum = excluded.item_level_sum, fame = excluded.fame,
        enchant = excluded.enchant, queen_creature = excluded.queen_creature,
        fashionista_aurora = excluded.fashionista_aurora, title = excluded.title,
        mikaela_hard_count = excluded.mikaela_hard_count, updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      adventure, c.characterId, c.serverId, c.characterName, c.jobId, c.jobGrowId, c.jobName, c.jobGrowName,
      c.itemLevelSum, c.fame, c.enchant, c.queenCreature, c.fashionistaAurora, c.title, c.mikaelaHardCount,
    )
    .run();
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
  const character = `SELECT adventure_name, character_name, server_id, job_grow_name, fame, dundam FROM characters`;
  const queries = {
    topFame: `${character} ORDER BY fame DESC LIMIT 1`,
    // 모험단 기준 카드는 랭킹 페이지와 같은 쿼리의 1위
    topFameSum: rankingQuery('fame-sum', 1),
    topFameAvg: rankingQuery('fame-avg', 1),
    topMikaela: rankingQuery('mikaela', 1),
    topBuffer: `${character} WHERE dundam LIKE '%만'
      ORDER BY CAST(REPLACE(dundam, '만', '') AS INTEGER) DESC LIMIT 1`,
    topCount: rankingQuery('count', 1),
  };
  const keys = Object.keys(queries) as (keyof typeof queries)[];
  const results = await env.DB.batch(keys.map((key) => env.DB.prepare(queries[key])));
  const highlights = Object.fromEntries(keys.map((key, i) => [key, results[i].results[0] ?? null]));

  return Response.json(
    { ok: true, ...highlights },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}

async function api(request: Request, env: Env, path: string) {
  if (request.method === 'GET' && path === '/api/highlights') return getHighlights(env);

  if (request.method === 'GET' && path === '/api/ranking') {
    const type = new URL(request.url).searchParams.get('type') as RankType;
    if (!RANK_TYPES.includes(type)) throw new BadRequest('type 값이 올바르지 않습니다.');
    return getRanking(env.DB, type);
  }

  if (request.method === 'GET' && path === '/api/statistics') {
    const type = new URL(request.url).searchParams.get('type') as StatType;
    if (!STAT_TYPES.includes(type)) throw new BadRequest('type 값이 올바르지 않습니다.');
    return getStatistics(env.DB, type);
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
      await upsert(env.DB, adventure, await getCharacterDetail(env.NEOPLE_API_KEY, member));
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
        await env.DB.prepare(`DELETE FROM characters WHERE adventure_name = ?1 AND character_uid = ?2`)
          .bind(adventure, uid)
          .run();
        return json({ ok: true, deleted: true });
      }
      if (base.adventureName !== adventure) return json({ ok: false, message: '모험단이 변경된 캐릭터입니다.' });
      await upsert(env.DB, adventure, await getCharacterDetail(env.NEOPLE_API_KEY, base));
      return json({ ok: true });
    }

    // 던담 수치 갱신
    case '/api/dundam': {
      const uid = text(body, 'uid', 64);
      const row = await env.DB.prepare(
        `SELECT server_id FROM characters WHERE adventure_name = ?1 AND character_uid = ?2`,
      )
        .bind(adventure, uid)
        .first<{ server_id: string }>();
      if (!row) return fail('저장된 캐릭터가 아닙니다.', 404);

      const value = await getDundamValue(row.server_id, uid);
      if (!value) return json({ ok: false, message: '던담 정보를 찾을 수 없습니다.' });
      await env.DB.prepare(`UPDATE characters SET dundam = ?1 WHERE adventure_name = ?2 AND character_uid = ?3`)
        .bind(value, adventure, uid)
        .run();
      return json({ ok: true, value });
    }
  }
  return fail('Not Found', 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(request, env, url.pathname);
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
    const tabPages: Record<string, readonly string[]> = { rank: RANK_TYPES, statistics: STAT_TYPES };
    if (url.pathname === '/data') {
      return Response.redirect(new URL(`/statistics/${STAT_TYPES[0]}`, url).toString(), 301);
    }
    const [, page, tab] = url.pathname.match(/^\/(rank|statistics)(?:\/([a-z-]*))?\/?$/) ?? [];
    if (page && !tab) {
      return Response.redirect(new URL(`/${page}/${tabPages[page][0]}`, url).toString(), 301);
    }
    if (page && tabPages[page].includes(tab)) {
      return env.ASSETS.fetch(new Request(new URL(`/${page}`, url), request));
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
