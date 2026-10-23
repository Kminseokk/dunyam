-- 어둑섬 클리어 수 → 미카엘라 하드 클리어 수 (최근 90일). 기존 값은 의미가 달라 비우고 다음 업데이트 때 채운다.
ALTER TABLE characters RENAME COLUMN dark_land_count TO mikaela_hard_count;
UPDATE characters SET mikaela_hard_count = NULL;
