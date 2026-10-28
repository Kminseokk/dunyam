-- 성장 레벨(item_level_sum), 던담 정보(dundam) 제거. 던담 버프력 인덱스가 dundam 을 참조하므로 먼저 지운다.
DROP INDEX IF EXISTS characters_by_buff;
ALTER TABLE characters DROP COLUMN item_level_sum;
ALTER TABLE characters DROP COLUMN dundam;
