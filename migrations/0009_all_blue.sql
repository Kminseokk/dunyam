-- 올 블루: 캐릭터별 달성 여부(all_blue, 모험단 페이지가 /api/equip 으로 장비를 불러올 때 서버가 판정해 저장)와
-- 모험단별 달성 캐릭터 수(allblue_count, 명예의 전당·랭킹용). 아직 판정 전인 캐릭터는 all_blue 가 NULL.
ALTER TABLE characters ADD COLUMN all_blue INTEGER;
ALTER TABLE adventures ADD COLUMN allblue_count INTEGER NOT NULL DEFAULT 0;

-- 랭킹 정렬 순서와 같은 인덱스 (src/ranking.ts)
CREATE INDEX adventures_by_allblue ON adventures (allblue_count DESC, character_count);
