// 장비 표시 공통 (모험단 장비 보기 · 스펙체크)
window.DyEquip = (function () {
  'use strict';

  var SLOT_NAMES = {
    WEAPON: '무기', TITLE: '칭호', SHOULDER: '머리어깨', JACKET: '상의', PANTS: '하의', WAIST: '벨트', SHOES: '신발',
    WRIST: '팔찌', AMULET: '목걸이', RING: '반지', SUPPORT: '보조장비', MAGIC_STON: '마법석', EARRING: '귀걸이'
  };
  var ARMOR = ['SHOULDER', 'JACKET', 'PANTS', 'WAIST', 'SHOES'];
  var ACCESSORY = ['WRIST', 'AMULET', 'RING'];
  var SPECIAL = ['SUPPORT', 'MAGIC_STON', 'EARRING'];

  // 마법부여 줄임말: 같은 값으로 붙는 옵션(물리·마법·독립 공격력 등)은 하나로 묶는다
  var ENCHANT_GROUPS = [
    ['모속강', ['모든속성강화']],
    ['화속강', ['화속성강화']], ['수속강', ['수속성강화']], ['명속강', ['명속성강화']], ['암속강', ['암속성강화']],
    ['스탯', ['힘', '지능', '체력', '정신력']],
    ['힘·지능', ['힘', '지능']], ['체력·정신력', ['체력', '정신력']],
    ['공격력', ['물리공격력', '마법공격력', '독립공격력']],
    ['크리티컬', ['물리크리티컬히트', '마법크리티컬히트']],
    ['공격력 증폭', ['공격력증폭']], ['최종뎀', ['최종데미지증가']],
    ['이속', ['이동속도']], ['공속', ['공격속도']], ['캐속', ['캐스팅속도']]
  ];

  // 전투와 상관없어 보여 주지 않는 옵션
  var HIDDEN = ['모험가명성', '마을이동속도증가', '인벤토리무게한도', 'HPMAX', 'MPMAX'];

  function enchantText(list) {
    list = list.filter(function (s) { return HIDDEN.indexOf(s.name.replace(/\s/g, '')) < 0; });
    var left = {};
    var names = {}; // 줄이지 못한 옵션은 원래 이름으로 보여 준다
    list.forEach(function (s) {
      var key = s.name.replace(/\s/g, '');
      left[key] = s.value;
      names[key] = s.name;
    });
    var out = [];
    ENCHANT_GROUPS.forEach(function (g) {
      var values = g[1].map(function (n) { return left[n]; });
      if (values.some(function (v) { return v == null || v !== values[0]; })) return;
      out.push(g[0] + ' ' + values[0]);
      g[1].forEach(function (n) { delete left[n]; });
    });
    Object.keys(left).forEach(function (n) { out.push(names[n] + ' ' + left[n]); });
    return out.join(' · ');
  }

  // 아이템 아이콘 (네오플 이미지 서버, API 키 불필요)
  function iconUrl(itemId) { return 'https://img-api.neople.co.kr/df/items/' + itemId; }

  return {
    SLOT_NAMES: SLOT_NAMES,
    ARMOR: ARMOR,
    ACCESSORY: ACCESSORY,
    SPECIAL: SPECIAL,
    ENCHANT_SLOTS: [].concat(ARMOR, ACCESSORY, SPECIAL), // 마법부여 대상 11부위
    enchantText: enchantText,
    iconUrl: iconUrl
  };
})();
