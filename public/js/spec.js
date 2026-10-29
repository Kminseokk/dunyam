(function () {
  'use strict';

  // 스펙체크: 서버 + 캐릭터명으로 캐릭터를 찾아 기본 정보만 보여 준다 (스펙 정보는 준비 중)
  //   캐릭터 찾기는 강화/증폭 기록과 같은 /api/record/character 를 쓴다
  var SERVERS = {
    cain: '카인', diregie: '디레지에', siroco: '시로코', prey: '프레이',
    casillas: '카시야스', hilder: '힐더', anton: '안톤', bakal: '바칼'
  };

  function $(id) { return document.getElementById(id); }
  function el(tag, text) {
    var node = document.createElement(tag);
    if (text != null) node.textContent = text;
    return node;
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
    $('summary').replaceChildren.apply($('summary'), cards.map(function (card) {
      var div = el('div');
      div.append(el('dt', card[0]), el('dd', card[1]));
      return div;
    }));
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
