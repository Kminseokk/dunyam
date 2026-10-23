-- 모험단 요약 테이블: 랭킹·명예의 전당이 캐릭터 전체를 스캔하지 않도록 모험단별 집계를 저장.
-- 캐릭터 저장/삭제 시 해당 모험단 한 줄만 다시 계산한다 (src/ranking.ts refreshAdventureStatements).
CREATE TABLE adventures (
  adventure_name  TEXT PRIMARY KEY,
  character_count INTEGER NOT NULL,
  fame_sum        INTEGER,
  fame_avg        INTEGER,
  mikaela_sum     INTEGER,
  top_character   TEXT,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO adventures (adventure_name, character_count, fame_sum, fame_avg, mikaela_sum, top_character)
SELECT adventure_name, COUNT(*), SUM(fame), ROUND(AVG(fame)), SUM(mikaela_hard_count),
  (SELECT character_name FROM characters t WHERE t.adventure_name = c.adventure_name ORDER BY fame DESC LIMIT 1)
FROM characters c GROUP BY adventure_name;

-- 랭킹 정렬 순서와 같은 인덱스 → 상위 N개만 읽음
CREATE INDEX adventures_by_fame_sum ON adventures (fame_sum DESC, character_count);
CREATE INDEX adventures_by_fame_avg ON adventures (fame_avg DESC, character_count);
CREATE INDEX adventures_by_count ON adventures (character_count DESC);
CREATE INDEX adventures_by_mikaela ON adventures (mikaela_sum DESC, character_count);

-- 명예의 전당 캐릭터 카드 (최고 명성, 최고 버퍼)
CREATE INDEX characters_by_fame ON characters (fame DESC);
CREATE INDEX characters_by_buff ON characters (CAST(REPLACE(dundam, '만', '') AS INTEGER) DESC)
  WHERE dundam LIKE '%만';
