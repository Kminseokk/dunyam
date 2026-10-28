// 판정 기준 목록. 이름 일부만 포함돼도 해당되는 것으로 본다.

// 모험단에 새로 등록할 수 있는 최소 명성
export const MIN_FAME = 50000;

export const AWAKENING_TITLES = ['2023 시즌3', '진정한 각성', '소년의 기억을', '흰 구름 감시자', '자신만의'];
export const QUEEN_CREATURES = ['폭룡왕 바칼', '순백의 나비', '페리아', '태초의 세리아', '차원의 마검사', '신부 세리아'];
export const FASHIONISTA_AURORAS = ['패셔니스타', '대마법사', '제네시스', '공포를 머금은', '페스타', '축복의 연인'];

// 타임라인에서 클리어 횟수를 세는 레이드 (레이드 201 + 선발대 210, 하드만)
export const MIKAELA_RAID = '무너진 성자 미카엘라';
// 레이드 출시일 (KST). 처음 집계할 때 이 시점부터 센다.
export const MIKAELA_RELEASE = '2026-08-06 00:00';

export const containsAny = (text: string | null | undefined, names: string[]) =>
  !!text && names.some((name) => text.includes(name));
