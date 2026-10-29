-- 스케줄러: 이번 주 레이드·레기온 클리어 기록
--   clears: JSON { weekStart: 'yyyy-MM-dd HH:mm' (KST), clears: [{ date, type: 'raid'|'legion', name }] }
--   스케줄러의 업데이트 버튼(/api/clears)으로 갱신한다.
ALTER TABLE characters ADD COLUMN clears TEXT;
ALTER TABLE characters ADD COLUMN clears_updated_at TEXT;
