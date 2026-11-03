-- 캐릭터 리스트의 시브(enchant)·나비(queen_creature)·오라(fashionista_aurora)·칭호(title) 제거.
-- 장비 정보는 모험단 페이지에서 /api/equip 으로 실시간 조회한다.
ALTER TABLE characters DROP COLUMN enchant;
ALTER TABLE characters DROP COLUMN queen_creature;
ALTER TABLE characters DROP COLUMN fashionista_aurora;
ALTER TABLE characters DROP COLUMN title;
