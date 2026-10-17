import { getDundamValue } from './dundam';
import { CharacterDetail, NeopleError, getCharacter, getCharacterDetail, searchCharacter } from './neople';
import { SERVERS } from './rules';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  NEOPLE_API_KEY: string;
}

const FALLBACK_IMAGE = '/image_class/20240111_update_2.webp';

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (message: string, status = 400) => json({ ok: false, message }, status);

class BadRequest extends Error {}

function text(body: Record<string, unknown>, key: string, max = 32) {
  const value = typeof body[key] === 'string' ? (body[key] as string).trim() : '';
  if (!value || value.length > max) throw new BadRequest(`${key} 값이 올바르지 않습니다.`);
  return value;
}

function serverId(body: Record<string, unknown>) {
  const id = text(body, 'server');
  if (!(id in SERVERS)) throw new BadRequest('server 값이 올바르지 않습니다.');
  return id;
}

async function upsert(db: D1Database, adventure: string, c: CharacterDetail) {
  await db
    .prepare(
      `INSERT INTO characters (
        adventure_name, character_uid, server_id, character_name, job_id, job_grow_id, job_name, job_grow_name,
        item_level_sum, fame, mist_gear_count, custom_epic_count, enchant, queen_creature, fashionista_aurora,
        title, dark_land_count
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
      ON CONFLICT (adventure_name, character_uid) DO UPDATE SET
        server_id = excluded.server_id, character_name = excluded.character_name,
        job_id = excluded.job_id, job_grow_id = excluded.job_grow_id,
        job_name = excluded.job_name, job_grow_name = excluded.job_grow_name,
        item_level_sum = excluded.item_level_sum, fame = excluded.fame,
        mist_gear_count = excluded.mist_gear_count, custom_epic_count = excluded.custom_epic_count,
        enchant = excluded.enchant, queen_creature = excluded.queen_creature,
        fashionista_aurora = excluded.fashionista_aurora, title = excluded.title,
        dark_land_count = excluded.dark_land_count, updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      adventure, c.characterId, c.serverId, c.characterName, c.jobId, c.jobGrowId, c.jobName, c.jobGrowName,
      c.itemLevelSum, c.fame, c.mistGearCount, c.customEpicCount, c.enchant, c.queenCreature,
      c.fashionistaAurora, c.title, c.darkLandCount,
    )
    .run();
}

// 이름으로 캐릭터를 찾고, 해당 모험단 소속인지 확인
async function findMember(env: Env, adventure: string, server: string, name: string) {
  const found = await searchCharacter(env.NEOPLE_API_KEY, server, name);
  if (!found) return null;
  const base = await getCharacter(env.NEOPLE_API_KEY, server, found.characterId);
  return base.adventureName === adventure ? base : null;
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
    darkLandSum: sum('dark_land_count'),
    mistGearSum: sum('mist_gear_count'),
  });
}

async function api(request: Request, env: Env, path: string) {
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
      const member = await findMember(env, adventure, serverId(body), text(body, 'name'));
      return json({ ok: !!member });
    }

    // 모험단에 캐릭터 추가
    case '/api/save': {
      const member = await findMember(env, adventure, serverId(body), text(body, 'name'));
      if (!member) return json({ ok: false, message: '해당 모험단에 속한 캐릭터가 아닙니다.' });
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

    // 준비 중인 페이지
    if (url.pathname === '/rank' || url.pathname === '/data') {
      return env.ASSETS.fetch(new Request(new URL('/wait', url), request));
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
