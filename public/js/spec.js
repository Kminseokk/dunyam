(function () {
  'use strict';

  // 스펙체크: 서버 + 캐릭터명으로 캐릭터를 찾아 기본 정보를 보여 주고, /api/spec 으로 스펙 정보를 채운다
  //   캐릭터 찾기는 강화/증폭 기록과 같은 /api/record/character 를 쓴다
  var SERVERS = {
    cain: '카인', diregie: '디레지에', siroco: '시로코', prey: '프레이',
    casillas: '카시야스', hilder: '힐더', anton: '안톤', bakal: '바칼'
  };

  function $(id) { return document.getElementById(id); }
  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function fmt(n) { return Number(n).toLocaleString(); }
  // 'dt / dd' 한 줄
  function fact(label, value) {
    var div = el('div');
    div.append(el('dt', label), el('dd', value));
    return div;
  }
  function message(text) { $('specMessage').textContent = text || ''; }

  var form = $('specForm');
  var current = null; // 마지막 검색 (먼저 보낸 검색의 늦은 응답은 버린다)

  async function search(server, name) {
    var job = current = {};
    $('searchBtn').disabled = true;
    $('result').hidden = true;
    message('');
    try {
      var res = await fetch('/api/record/character?server=' + server + '&name=' + encodeURIComponent(name));
      var data = await res.json();
      if (job !== current) return;
      if (!data.ok) throw new Error(data.message);
      render(data.character);
      loadSpec(job, data.character);
    } catch (e) {
      if (job === current) message(e.message || '캐릭터를 불러오지 못했습니다.');
    } finally {
      if (job === current) $('searchBtn').disabled = false;
    }
  }

  function render(c) {
    $('result').hidden = false;
    $('characterTitle').textContent = c.characterName + ' (' + (SERVERS[c.serverId] || c.serverId) + ')';
    // 캐릭터 이미지 (네오플 이미지 서버, API 키 불필요). zoom=2 는 400×460 이라 화면에서는 절반 크기로 선명하게 보인다
    $('characterImage').src = 'https://img-api.neople.co.kr/df/servers/' + encodeURIComponent(c.serverId) +
      '/characters/' + encodeURIComponent(c.characterId) + '?zoom=2';
    $('characterImage').alt = c.characterName;
    var cards = [
      ['직업', c.jobGrowName || c.jobName || '-'],
      ['레벨', c.level != null ? c.level : '-'],
      ['명성', c.fame != null ? Number(c.fame).toLocaleString() : '-'],
      ['모험단', c.adventureName || '-']
    ];
    // 이미지 아래 '항목 / 값' 목록
    $('summary').replaceChildren.apply($('summary'), cards.map(function (card) { return fact(card[0], card[1]); }));
  }

  // ─── 스펙 정보 ───
  async function loadSpec(job, c) {
    $('specDetail').hidden = true;
    $('specStatus').hidden = false;
    $('specStatus').textContent = '스펙 정보를 불러오는 중...';
    try {
      var res = await fetch('/api/spec?server=' + c.serverId + '&id=' + c.characterId);
      var data = await res.json();
      if (job !== current) return;
      if (!data.ok) throw new Error(data.message);
      renderSpec(data.spec);
      $('specStatus').hidden = true;
      $('specDetail').hidden = false;
    } catch (e) {
      if (job === current) $('specStatus').textContent = e.message || '스펙 정보를 불러오지 못했습니다.';
    }
  }

  function renderSpec(s) {
    var st = s.stats;
    // 핵심 스탯: 딜러는 공격력 증가·증폭, 버퍼는 버프력·버프력 증폭
    var cards = [
      st.buffer ? ['버프력', fmt(st.buff)] : ['공격력 증가', fmt(st.attack)],
      st.buffer ? ['버프력 증폭', fmt(st.buffAmp) + '%'] : ['공격력 증폭', fmt(st.attackAmp) + '%'],
      [st.mainStat.name, fmt(st.mainStat.value)],
      [st.crit.name, st.crit.value + '%'],
      ['최고 속성 강화', st.element.name.replace(' 강화', '') + ' ' + fmt(st.element.value)],
      ['쿨타임 감소', st.cooldown + '%']
    ];
    $('specStats').replaceChildren.apply($('specStats'), cards.map(function (card) {
      var div = el('div');
      div.append(el('span', card[0]), el('strong', card[1]));
      return div;
    }));

    // 세트·장비 요약: 세트 포인트, 강화·증폭 합계, 증폭 부위, 품급
    var lines = s.sets.map(function (set) {
      return [set.name + ' (' + set.rarity + ')', set.point != null ? '세트 포인트 ' + fmt(set.point) + ' / ' + fmt(set.max) : ''];
    });
    var eq = s.equipment;
    var sum = eq.reduce(function (a, e) { return a + e.reinforce; }, 0);
    var amplified = eq.filter(function (e) { return e.amplified; }).length;
    var best = eq.filter(function (e) { return e.grade === '최상급'; }).length;
    lines.push(['강화·증폭 합계 +' + sum, '증폭 ' + amplified + ' / ' + eq.length + '부위 · 최상급 ' + best + '부위']);
    if (s.title) lines.push(['칭호', s.title]);
    $('specSummary').replaceChildren.apply($('specSummary'), lines.map(function (line) {
      var li = el('li');
      li.append(el('b', line[0]), document.createTextNode(line[1] ? ' · ' + line[1] : ''));
      return li;
    }));

    $('specEquipment').replaceChildren.apply($('specEquipment'), eq.map(function (e) {
      var tr = el('tr');
      tr.append(
        el('td', e.slot),
        el('td', e.name, 'item rarity-' + e.rarity),
        el('td', (e.amplified ? '증폭 +' : '강화 +') + e.reinforce, e.amplified ? 'ok' : ''),
        el('td', e.refine ? '+' + e.refine : '-', e.refine ? '' : 'muted'),
        el('td', e.grade || '-', e.grade === '최상급' ? 'ok' : ''),
        el('td', e.tune || '-', e.tune ? '' : 'muted')
      );
      return tr;
    }));

    // 기타: 크리처·아티팩트, 오라, 플래티넘 엠블렘, 안개 동화
    var cr = s.creature;
    var etc = [
      ['크리처', cr ? cr.name + ' (' + cr.rarity + ')' : '-'],
      ['아티팩트', cr && cr.artifacts.length ? cr.artifacts.map(function (a) { return a.name; }).join(', ') : '-'],
      ['오라', s.aura || '-'],
      ['플래티넘 엠블렘', s.platinum.length ? s.platinum.join(', ') : '-'],
      ['안개 동화', s.mist ? 'Lv.' + s.mist.level + ' (' + s.mist.rate + ')' : '-']
    ];
    $('specEtc').replaceChildren.apply($('specEtc'), etc.map(function (e) { return fact(e[0], e[1]); }));
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var server = form.elements.server.value;
    var name = form.elements.name.value.trim();
    if (!name) return;
    history.replaceState(null, '', '?server=' + server + '&name=' + encodeURIComponent(name));
    search(server, name);
  });

  // 주소에 ?server=&name= 이 있으면 바로 검색 (공유한 주소로 들어온 경우)
  var params = new URLSearchParams(location.search);
  if (params.get('name')) {
    if (SERVERS[params.get('server')]) form.elements.server.value = params.get('server');
    form.elements.name.value = params.get('name');
    search(form.elements.server.value, form.elements.name.value.trim());
  }
})();
