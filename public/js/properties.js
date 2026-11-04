(function () {
  'use strict';

  var SERVERS = {
    cain: '카인', diregie: '디레지에', siroco: '시로코', prey: '프레이',
    casillas: '카시야스', hilder: '힐더', anton: '안톤', bakal: '바칼'
  };
  var COLUMNS = [
    'job_name', 'job_grow_name', 'fame', 'mikaela_hard_count'
  ];

  var adventureName = (new URLSearchParams(location.search).get('search') || '').trim();
  var characters = [];

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return n == null ? '-' : Number(n).toLocaleString(); }

  async function post(path, body) {
    var res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ adventure: adventureName }, body))
    });
    return res.json();
  }

  function cell(tag, text, className) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text == null ? '-' : String(text);
    return el;
  }

  // 캐릭터 이름 → 스펙체크 (spec.js 가 ?server=&name= 으로 바로 검색)
  function specLink(c) {
    var a = document.createElement('a');
    a.className = 'spec-link';
    a.href = '/spec?server=' + encodeURIComponent(c.server_id) + '&name=' + encodeURIComponent(c.character_name);
    a.textContent = c.character_name;
    a.title = c.character_name + ' 스펙체크';
    var icon = document.createElement('i');
    icon.className = 'material-icons spec-link-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'arrow_forward_ios';
    a.append(icon);
    return a;
  }

  function render(data) {
    characters = data.characters;
    $('hero').style.backgroundImage = "url('" + data.imagePath + "')";

    var top = data.representative;
    if (top) {
      $('repre_char').innerText =
        '서버 | ' + (SERVERS[top.server_id] || top.server_id) +
        '\n대표 캐릭터 | ' + top.character_name +
        '\n직업 | ' + top.job_grow_name +
        '\n명성 | ' + fmt(top.fame);
    }

    $('character_count').innerText = fmt(characters.length);
    $('fame_avg').innerText = fmt(data.fameAvg);
    $('mikaela_hard_sum').innerText = fmt(data.mikaelaHardSum);

    var tbody = $('characterRows');
    tbody.replaceChildren();
    characters.forEach(function (c) {
      var tr = document.createElement('tr');

      var server = cell('td');
      server.replaceChildren(cell('h6', SERVERS[c.server_id] || c.server_id, 'mb-0 text-sm px-3 py-1'));
      var name = cell('td');
      var title = cell('h6', null, 'mb-0 text-sm');
      title.replaceChildren(specLink(c));
      name.replaceChildren(title);
      tr.append(server, name);

      COLUMNS.forEach(function (key) {
        var td = cell('td', null, 'align-middle text-center text-sm');
        td.replaceChildren(cell('span', key === 'fame' ? fmt(c[key]) : c[key], 'text-xs font-weight-bold'));
        tr.append(td);
      });
      tbody.append(tr);
    });
    loadEquip();
  }

  // ─── 캐릭터 장비: 캐릭터 한 명을 한 줄로 ───
  // 아이콘 칸 묶음 (방어구·악세사리·특수장비는 마법부여 대상). 공통 정의는 equip.js
  var ICON_GROUPS = [['WEAPON'], DyEquip.ARMOR, DyEquip.ACCESSORY, DyEquip.SPECIAL];
  var ENCHANT_SLOTS = DyEquip.ENCHANT_SLOTS;
  var SLOT_NAMES = DyEquip.SLOT_NAMES;
  var enchantText = DyEquip.enchantText;

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // 아이템 아이콘 (테두리는 등급 색)
  function itemIcon(item) {
    var box = el('div', null, 'eq-icon' + (item ? ' rarity-' + item.rarity : ''));
    if (item && item.id) {
      var img = el('img');
      img.src = DyEquip.iconUrl(item.id);
      img.alt = '';
      img.loading = 'lazy';
      box.append(img);
    }
    return box;
  }

  // 장비 칸: 아이콘 + 강화·증폭 수치, 마법부여가 없으면 빨간 점, 아래에 마법부여 등급. 마우스를 올리면 자세히
  function equipIcon(e, slot) {
    var cell = el('div', null, 'eq-slot');
    var box = itemIcon(e);
    cell.append(box);
    var enchantable = ENCHANT_SLOTS.indexOf(slot) >= 0;
    // 마법부여 등급 (rules.ts 기준, 무기 포함). 빈 칸도 자리를 잡아 아이콘 줄을 맞춘다
    if (enchantable || slot === 'WEAPON') {
      cell.append(gradeLabel(e && e.enchantGrade, SLOT_NAMES[slot] + ' 마법부여', e ? e.enchant : []));
    }
    if (!e) {
      box.title = SLOT_NAMES[slot] + ' · 미착용';
      return cell;
    }
    var enchant = e.enchant.length ? enchantText(e.enchant) : '';
    box.title = SLOT_NAMES[slot] + ' · ' + e.name +
      '\n' + (e.amplified ? '증폭 +' : '강화 +') + e.reinforce + (e.refine ? ' · 제련 +' + e.refine : '') +
      '\n마법부여: ' + (enchant || '없음') + (e.enchantGrade ? ' (' + e.enchantGrade + ')' : '');
    // 제련이 있으면 '강화/제련' (예: +12/+8)
    var up = e.refine ? '+' + e.reinforce + '/+' + e.refine : e.reinforce ? '+' + e.reinforce : '';
    if (up) box.append(el('span', up, 'eq-up' + (e.amplified ? ' amp' : '')));
    if (!enchant && enchantable) box.append(el('span', null, 'eq-dot'));
    return cell;
  }

  // 등급 칸 (종결 / 준종결 / 보급). 마우스를 올리면 옵션을 한 줄에 하나씩 띄운다 (아래 tip 처리)
  function gradeLabel(grade, title, options) {
    var label = el('span', grade || '', 'eq-grade' + (grade ? ' grade-' + grade : ''));
    if (grade) label.dataset.tip = title + '\n' + (options.length ? enchantText(options).split(' · ').join('\n') : '없음');
    return label;
  }

  // 아이콘 + 이름 (칭호·크리처·오라). label 이 있으면 이름 아래에 등급 칸
  function itemCell(item, label) {
    var td = el('td');
    var wrap = el('div', null, 'eq-item');
    var text = el('div', null, 'eq-item-text');
    var name = el('span', item ? item.name : '-', 'eq-item-name ' + (item ? 'rarity-' + item.rarity : 'muted'));
    name.title = item ? item.name : '';
    text.append(name);
    if (label) text.append(label);
    wrap.append(itemIcon(item), text);
    td.append(wrap);
    return td;
  }

  var EQUIP_COLUMNS = 6; // 명성 다음 칸 수 (불러오는 중 / 오류 안내가 차지)

  // 올 블루: 서버가 판정한 결과(마법부여 12부위·칭호·크리처·오라 모두 종결)를 보여 준다.
  // 마우스를 올리면 종결이 아닌 항목
  function allBlueCell(allBlue) {
    var td = el('td');
    var label = el('span', allBlue.done ? '달성' : '미달성', 'eq-allblue' + (allBlue.done ? ' done' : ''));
    label.dataset.tip = allBlue.done ? '모두 종결' : '종결이 아닌 항목\n' + allBlue.missing.join('\n');
    td.append(label);
    return td;
  }

  function equipRow(c) {
    var tr = el('tr');
    var td = el('td');
    var who = el('div', null, 'eq-who');
    td.append(who);
    // 캐릭터 이미지는 얼굴 쪽만 확대해서 보여 준다 (CSS .eq-face)
    var face = el('div', null, 'eq-face');
    var img = el('img');
    img.src = 'https://img-api.neople.co.kr/df/servers/' + encodeURIComponent(c.server_id) +
      '/characters/' + encodeURIComponent(c.character_uid) + '?zoom=1';
    img.alt = '';
    img.loading = 'lazy';
    face.append(img);
    var name = el('div');
    var strong = el('strong');
    strong.append(specLink(c));
    name.append(strong, el('span', (SERVERS[c.server_id] || c.server_id) + ' · ' + c.job_grow_name));
    who.append(face, name);
    var rest = el('td', '장비 정보를 불러오는 중...', 'eq-loading');
    rest.colSpan = EQUIP_COLUMNS;
    tr.append(td, el('td', fmt(c.fame), 'eq-fame'), rest);
    return { tr: tr, rest: rest };
  }

  function fillRow(row, eq) {
    var bySlot = {};
    eq.equipment.forEach(function (e) { bySlot[e.slot] = e; });
    var cells = [];

    // 세트: 한 줄에 '이름 포인트'
    var sets = el('td', null, 'eq-text');
    if (!eq.sets.length) sets.append(el('div', '-', 'eq-name muted'));
    eq.sets.forEach(function (s) {
      var line = el('div', s.name.replace(/ 세트$/, ''), 'eq-name rarity-' + s.rarity);
      if (s.point != null) line.append(el('small', ' ' + fmt(s.point) + 'P', 'eq-sub'));
      sets.append(line);
    });
    cells.push(sets);

    cells.push(allBlueCell(eq.allBlue));

    // 장비 / 마법부여: 무기·방어구·악세사리·특수장비를 한 칸에, 묶음 사이는 조금 띄운다
    var gear = el('td');
    var wrap = el('div', null, 'eq-icons');
    ICON_GROUPS.forEach(function (slots) {
      var group = el('div', null, 'eq-icon-group');
      slots.forEach(function (slot) { group.append(equipIcon(bySlot[slot], slot)); });
      wrap.append(group);
    });
    gear.append(wrap);
    cells.push(gear);

    var title = eq.title;
    var creature = eq.creature;
    var aura = eq.aura;
    cells.push(itemCell(title, title && title.grade ? gradeLabel(title.grade, '칭호 옵션', title.options) : null),
      itemCell(creature, creature && creature.grade ? gradeLabel(creature.grade, '크리처 옵션', creature.options) : null),
      itemCell(aura, aura && aura.grade ? gradeLabel(aura.grade, '오라 옵션', aura.options) : null));

    row.rest.replaceWith.apply(row.rest, cells);
    return eq.allBlue.done;
  }

  // 등급 칸(data-tip)에 마우스를 올리면 칸 위에 옵션 상자를 띄운다. 위 공간이 모자라면 아래로
  var tip = el('div', null, 'eq-tip');
  tip.hidden = true;
  document.body.append(tip);
  $('equipRows').addEventListener('mouseover', function (event) {
    var target = event.target.closest('[data-tip]');
    if (!target) return;
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
    var r = target.getBoundingClientRect();
    var left = Math.min(Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2), innerWidth - tip.offsetWidth - 8);
    var top = r.top - tip.offsetHeight - 6;
    tip.style.left = left + 'px';
    tip.style.top = (top < 8 ? r.bottom + 6 : top) + 'px';
  });
  $('equipRows').addEventListener('mouseout', function (event) {
    if (event.target.closest('[data-tip]')) tip.hidden = true;
  });
  addEventListener('scroll', function () { tip.hidden = true; }, true);

  // 캐릭터마다 /api/equip (네오플 3회) 을 3명씩 동시에 요청
  var equipJob = null;
  async function loadEquip() {
    var job = equipJob = {};
    var list = characters.slice();
    var rows = list.map(equipRow);
    $('equipRows').replaceChildren.apply($('equipRows'), rows.map(function (x) { return x.tr; }));
    var next = 0;
    var done = 0;
    var allBlue = 0; // 올 블루 달성 캐릭터 수 (위 요약 카드)
    var progress = $('equipProgress');
    $('allblue_count').innerText = '0';
    async function worker() {
      while (next < list.length && job === equipJob) {
        var i = next++;
        try {
          var res = await fetch('/api/equip?server=' + list[i].server_id + '&id=' + list[i].character_uid);
          var data = await res.json();
          if (job !== equipJob) return;
          if (!data.ok) throw new Error(data.message);
          if (fillRow(rows[i], data.equip)) $('allblue_count').innerText = fmt(++allBlue);
        } catch (e) {
          if (job === equipJob) rows[i].rest.textContent = e.message || '장비 정보를 불러오지 못했습니다.';
        }
        done++;
        if (job === equipJob) progress.textContent = done < list.length ? done + ' / ' + list.length : '';
      }
    }
    await Promise.all([worker(), worker(), worker()]);
  }

  async function load() {
    var res = await fetch('/api/adventure?name=' + encodeURIComponent(adventureName));
    var data = await res.json();
    if (!data.ok) throw new Error(data.message);
    render(data);
  }

  // 캐릭터 검색 → 모험단 소속 확인 → 추가
  var form = $('char_searchForm');
  var message = $('searchResultMessage');
  var addContainer = $('addButtonContainer');

  function formBody() {
    return { name: form.elements.name.value };
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    addContainer.hidden = true;
    message.textContent = '검색 중...';
    try {
      var result = await post('/api/check', formBody());
      message.textContent = result.ok
        ? '해당 모험단에 속한 캐릭터 입니다. 추가하시겠습니까?'
        : result.message || '해당 모험단에 속한 캐릭터가 아닙니다.';
      addContainer.hidden = !result.ok;
    } catch (e) {
      message.textContent = '검색 중 오류가 발생했습니다.';
    }
  });

  $('addButton').addEventListener('click', async function () {
    var button = this;
    button.disabled = true;
    message.textContent = '추가 중...';
    try {
      var result = await post('/api/save', formBody());
      if (!result.ok) throw new Error(result.message);
      message.textContent = '추가되었습니다.';
      addContainer.hidden = true;
      await load();
    } catch (e) {
      message.textContent = e.message || '추가에 실패했습니다.';
    } finally {
      button.disabled = false;
    }
  });

  // 업데이트: 캐릭터별로 한 명씩 요청 (Workers 요청당 외부 호출 수 제한 대응)
  document.querySelectorAll('[data-update]').forEach(function (button) {
    button.addEventListener('click', async function () {
      var endpoint = '/api/' + button.dataset.update;
      var buttons = document.querySelectorAll('[data-update]');
      var progress = $('updateProgress');
      var failed = 0;
      buttons.forEach(function (b) { b.disabled = true; });

      for (var i = 0; i < characters.length; i++) {
        progress.textContent = (i + 1) + ' / ' + characters.length;
        try {
          var result = await post(endpoint, { uid: characters[i].character_uid });
          if (!result.ok) failed++;
        } catch (e) {
          failed++;
        }
      }

      progress.textContent = failed ? failed + '명 업데이트 실패' : '';
      buttons.forEach(function (b) { b.disabled = false; });
      await load();
    });
  });

  if (!adventureName) {
    location.replace('/');
    return;
  }
  $('adventureName').innerText = adventureName;
  document.title = adventureName + ' - 던전앤파이터 모험단 검색 사이트';
  load().catch(function (e) {
    console.error(e);
    message.textContent = '모험단 정보를 불러오지 못했습니다.';
  });
})();
