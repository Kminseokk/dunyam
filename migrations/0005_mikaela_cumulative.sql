-- 미카엘라 하드 클리어 수: 최근 90일 → 출시 이후 누적
--   mikaela_base: mikaela_cutoff 이전 클리어 수 (확정값), mikaela_cutoff: KST 'yyyy-MM-dd HH:mm'
--   기존 값은 출시(2026-08-06)가 90일 이내라 누적값과 같다. cutoff 가 비어 있으면 다음 업데이트 때 출시일부터 다시 센다.
ALTER TABLE characters ADD COLUMN mikaela_base INTEGER;
ALTER TABLE characters ADD COLUMN mikaela_cutoff TEXT;
