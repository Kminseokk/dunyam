-- 모험단별 캐릭터 정보. 기존 MySQL의 "모험단 이름 = 테이블" 구조를 단일 테이블로 통합.
CREATE TABLE characters (
  adventure_name     TEXT NOT NULL,
  character_uid      TEXT NOT NULL,
  server_id          TEXT NOT NULL,
  character_name     TEXT NOT NULL,
  job_id             TEXT,
  job_grow_id        TEXT,
  job_name           TEXT,
  job_grow_name      TEXT,
  item_level_sum     INTEGER,
  fame               INTEGER,
  dundam             TEXT NOT NULL DEFAULT '업데이트 필요',
  mist_gear_count    INTEGER,
  custom_epic_count  INTEGER,
  enchant            TEXT,
  queen_creature     TEXT,
  fashionista_aurora TEXT,
  title              TEXT,
  dark_land_count    INTEGER,
  updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (adventure_name, character_uid)
);
