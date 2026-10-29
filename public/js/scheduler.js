(function () {
  'use strict';

  // 스케줄러: 모험단 이름 → 등록된 캐릭터들의 이번 주 레기온·레이드 클리어 현황
  //   클리어 기록은 업데이트 버튼(/api/clears)으로 캐릭터마다 갱신해 DB에 저장된 값을 보여 준다
  var SERVERS = {
    cain: '카인', diregie: '디레지에', siroco: '시로코', prey: '프레이',
    casillas: '카시야스', hilder: '힐더', anton: '안톤', bakal: '바칼'
  };

  // 레이드 아래에 항상 보여 줄 열 (모드 이름은 타임라인 modeName, 하드는 서버에서 '(하드)' 붙임)
  //   label: 열 이름, modes: { 모드 이름: 칸에 표시할 이름 } — 모드가 여럿이면 한 열에 묶어 클리어한 모드를 표시
  // 목록에 없는 모드가 기록에 나오면 모드 이름 그대로 한 열씩 뒤에 덧붙인다.
  var RAID_COLUMNS = [
    { label: '미카엘라 레이드', modes: { '미카엘라 : 균열서': '균열서', '미카엘라 : 종언서': '종언서', '미카엘라 : 종언서(하드)': '종언서(하드)' } },
    { label: '디레지에 레이드', modes: { '디레지에 : 서막': '서막', '디레지에 : 종막': '종막', '디레지에 : 악연(하드)': '악연(하드)' } },
    { label: '만들어진 신 나벨 레이드', modes: { '무의지의 장벽': '무의지의 장벽', '무지의 악': '무지의 악', '무지의 악(하드)': '무지의 악(하드)' } },
    { label: '바칼 레이드(하드)' },
    { label: '이내 황혼전' }
  ].map(function (col) {
    if (!col.modes) {
      col.modes = {};
      col.modes[col.label] = col.label;
    }
    return col;
  });

  var adventureName = '';
  var characters = [];

  function $(id) { return document.getElementById(id); }
  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function message(text) { $('message').textContent = text || ''; }

  // ─── 이번 주 클리어 표 ───
  // 주간 초기화: 목요일 06:00 (KST). 서버(src/neople.ts weekStart)와 같은 계산
  function weekStart() {
    var kst = new Date(Date.now() + 9 * 3600000);
    var start = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 6));
    start.setUTCDate(start.getUTCDate() - ((kst.getUTCDay() - 4 + 7) % 7));
    if (start > kst) start.setUTCDate(start.getUTCDate() - 7);
    return start.toISOString().slice(0, 16).replace('T', ' ');
  }

  // 캐릭터별 이번 주 기록 (저장된 기록이 지난주 것이면 null = 업데이트 필요)
  function weeklyClears(c, start) {
    var saved = null;
    try { saved = JSON.parse(c.clears || 'null'); } catch (e) { /* 잘못된 값 */ }
    if (!saved || saved.weekStart !== start) return null;
    return saved.clears;
  }

  function th(text, className, attrs) {
    var node = el('th', text, className);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  function renderClears() {
    var start = weekStart();

    // 열: 레기온은 이번 주 기록에 나온 이름(가나다순), 레이드는 RAID_COLUMNS + 기록에만 있는 모드
    var names = { legion: {}, raid: {} };
    var rows = characters.map(function (c) {
      var list = weeklyClears(c, start);
      var count = { legion: {}, raid: {} };
      (list || []).forEach(function (r) {
        names[r.type][r.name] = true;
        count[r.type][r.name] = (count[r.type][r.name] || 0) + 1;
      });
      return { c: c, count: count, updated: !!list };
    });
    // 열 = { label, modes: { 모드 이름: 표시 이름 } }. 레기온은 열 하나에 이름 하나
    var known = {};
    RAID_COLUMNS.forEach(function (col) { Object.keys(col.modes).forEach(function (m) { known[m] = true; }); });
    var single = function (name) { var modes = {}; modes[name] = name; return { label: name, modes: modes }; };
    var legions = Object.keys(names.legion).sort().map(single);
    var raids = RAID_COLUMNS.concat(Object.keys(names.raid).filter(function (n) { return !known[n]; }).sort().map(single));

    // 머리글 2줄. 기록이 없는 묶음은 '-' 한 칸
    var top = el('tr');
    top.append(
      th('서버', '', { rowspan: 2 }),
      th('캐릭터명', 'name', { rowspan: 2 }),
      th('레기온', 'group-start', { colspan: Math.max(1, legions.length) }),
      th('레이드', 'group-start', { colspan: Math.max(1, raids.length) })
    );
    var sub = el('tr');
    [legions, raids].forEach(function (list) {
      if (!list.length) { sub.append(th('-', 'group-start')); return; }
      list.forEach(function (col, i) { sub.append(th(col.label, i ? '' : 'group-start')); });
    });
    $('clearHead').replaceChildren(top, sub);

    var tbody = $('characterRows');
    tbody.replaceChildren();
    if (!rows.length) {
      var empty = el('tr');
      var td = el('td', '등록된 캐릭터가 없는 모험단입니다.', 'empty');
      td.colSpan = 2 + Math.max(1, legions.length) + Math.max(1, raids.length);
      empty.append(td);
      tbody.append(empty);
      return;
    }
    rows.forEach(function (row) {
      var tr = el('tr');
      tr.append(el('td', SERVERS[row.c.server_id] || row.c.server_id), el('td', row.c.character_name, 'name'));

      [['legion', legions], ['raid', raids]].forEach(function (group) {
        var list = group[1].length ? group[1] : [null];
        list.forEach(function (col, i) {
          // 클리어한 모드: 열에 모드가 하나면 'N회', 여럿이면 '표시 이름' (2회 이상이면 'N회' 덧붙임)
          var modes = col ? Object.keys(col.modes) : [];
          var done = modes.filter(function (m) { return row.count[group[0]][m]; }).map(function (m) {
            var n = row.count[group[0]][m];
            return modes.length > 1 ? col.modes[m] + (n > 1 ? ' ' + n + '회' : '') : n + '회';
          });
          // 이번 주에 업데이트하지 않은 캐릭터는 '?' (업데이트 필요)
          var state = done.length ? 'cleared' : row.updated ? 'none' : 'unknown';
          var td = el('td', done.length ? done.join(', ') : row.updated ? '-' : '?', state + (i ? '' : ' group-start'));
          if (!row.updated) td.title = '이번 주 업데이트 전입니다.';
          tr.append(td);
        });
      });
      tbody.append(tr);
    });
  }

  // ─── 모험단 불러오기 ───
  async function load() {
    var res = await fetch('/api/adventure?name=' + encodeURIComponent(adventureName));
    var data = await res.json();
    if (!data.ok) throw new Error(data.message);
    characters = data.characters;
    $('result').hidden = false;
    $('adventureTitle').textContent = adventureName + ' · 캐릭터 ' + characters.length + '명';
    $('updateBtn').disabled = !characters.length;
    renderClears();
  }

  function open(name) {
    adventureName = name;
    document.title = name + ' - 스케줄러 - 던전앤파이터 모험단 검색 사이트';
    message('');
    $('progressBox').hidden = true;
    load().catch(function (e) {
      console.error(e);
      $('result').hidden = true;
      message('모험단 정보를 불러오지 못했습니다.');
    });
  }

  // 검색: 주소(?search=)를 바꾸고 그 자리에서 불러온다 (주소 공유 가능)
  var form = $('adventureForm');
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var name = form.elements.adventure.value.trim();
    if (!name) return;
    history.replaceState(null, '', '?search=' + encodeURIComponent(name));
    open(name);
  });

  // 업데이트: 캐릭터별로 한 명씩 요청 (Workers 요청당 외부 호출 수 제한 대응), 진행률 표시
  $('updateBtn').addEventListener('click', async function () {
    var button = this;
    var failed = 0;
    button.disabled = true;
    $('progressBox').hidden = false;
    for (var i = 0; i < characters.length; i++) {
      var c = characters[i];
      var p = Math.floor((i / characters.length) * 100);
      $('progressBar').style.width = p + '%';
      $('progressPct').textContent = p + '%';
      $('progressText').textContent = c.character_name + ' 업데이트 중 (' + (i + 1) + ' / ' + characters.length + ')';
      try {
        var res = await fetch('/api/clears', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adventure: adventureName, uid: c.character_uid })
        });
        if (!(await res.json()).ok) failed++;
      } catch (e) {
        failed++;
      }
    }
    $('progressBar').style.width = '100%';
    $('progressPct').textContent = '100%';
    $('progressText').textContent = failed ? '완료 (' + failed + '명 업데이트 실패)' : '완료';
    button.disabled = false;
    await load();
  });

  // 주소에 ?search= 가 있으면 바로 불러온다
  var initial = (new URLSearchParams(location.search).get('search') || '').trim();
  if (initial) {
    form.elements.adventure.value = initial;
    open(initial);
  }
})();
