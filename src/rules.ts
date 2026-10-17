// 판정 기준 목록. 이름 일부만 포함돼도 해당되는 것으로 본다.
export const SERVERS: Record<string, string> = {
  cain: '카인',
  diregie: '디레지에',
  siroco: '시로코',
  prey: '프레이',
  casillas: '카시야스',
  hilder: '힐더',
  anton: '안톤',
  bakal: '바칼',
};

export const CUSTOM_EPICS = ['숲속의 마녀', '블루 베릴', '엔트 정령', '딥 다이버', '블루 파이렛'];
export const MIST_GEAR_SET = '안개를 걷는 자 세트';
export const AWAKENING_TITLES = ['2023 시즌3', '진정한 각성', '소년의 기억을', '흰 구름 감시자', '자신만의'];
export const QUEEN_CREATURES = ['폭룡왕 바칼', '순백의 나비', '페리아', '태초의 세리아', '차원의 마검사', '신부 세리아'];
export const FASHIONISTA_AURORAS = ['패셔니스타', '대마법사', '제네시스', '공포를 머금은', '페스타', '축복의 연인'];

export const DARK_LAND_REGION = '어둑섬';
export const DARK_LAND_START = '20231108T0000';

export const containsAny = (text: string | null | undefined, names: string[]) =>
  !!text && names.some((name) => text.includes(name));
