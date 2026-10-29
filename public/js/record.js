(function () {
  'use strict';

  // 강화/증폭 기록: 서버 + 캐릭터명 → 2017년 9월부터 지금까지 타임라인(401 강화, 402 증폭)을 구간별로 불러와 정리
  //   기간은 서버(/api/record/character)가 알려 주는 시작 시각 ~ 검색한 순간
  //   구간 하나는 최대 maxDays 일, CONCURRENCY 개씩 동시에 요청하며 진행률을 표시
  var SERVERS = {
    cain: '카인', diregie: '디레지에', siroco: '시로코', prey: '프레이',
    casillas: '카시야스', hilder: '힐더', anton: '안톤', bakal: '바칼'
  };
  var TYPES = { enhance: '강화', amplify: '증폭' };
  var CONCURRENCY = 3;
  var PAGE_SIZE = 50; // 전체 기록 표에 한 번에 보여 줄 줄 수
  var DAY = 86400000;

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return Number(n).toLocaleString(); }
  function pct(a, b) { return b ? (Math.round((a / b) * 1000) / 10) + '%' : '-'; }
  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // KST 'yyyy-MM-dd HH:mm' 문자열 계산
  function kstText(ms) { return new Date(ms + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' '); }
  function kstMs(text) { return new Date(text.replace(' ', 'T') + ':00+09:00').getTime(); }

  function windows(start, maxDays) {
    var list = [];
    var end = kstText(Date.now());
    for (var from = start; from < end; ) {
      var to = kstText(kstMs(from) + maxDays * DAY);
      if (to > end) to = end;
      list.push({ start: from, end: to, last: to === end });
      from = to;
    }
    return list;
  }

  async function getJson(url) {
    var res = await fetch(url);
    var data = await res.json();
    if (!data.ok) throw new Error(data.message || '불러오지 못했습니다.');
    return data;
  }

  // ─── 검색 ───
  var form = $('recordForm');
  var job = null; // 진행 중인 검색 (새 검색을 시작하면 이전 검색 결과는 버린다)
  var records = [];
  var filter = 'all';
  var shown = 0;

  function message(text) { $('recordMessage').textContent = text || ''; }

  function progress(done, total, label) {
    var p = total ? Math.floor((done / total) * 100) : 0;
    $('progressBox').hidden = false;
    $('progressBar').style.width = p + '%';
    $('progressPct').textContent = p + '%';
    $('progressText').textContent = label;
  }

  async function search(server, name) {
    var current = job = {};
    $('searchBtn').disabled = true;
    $('result').hidden = true;
    message('');
    progress(0, 1, '캐릭터를 찾는 중...');
    try {
      var info = await getJson('/api/record/character?server=' + server + '&name=' + encodeURIComponent(name));
      if (current !== job) return;
      var c = info.character;
      var list = windows(info.start, info.maxDays);
      var results = new Array(list.length);
      var next = 0, done = 0;

      // 구간을 CONCURRENCY 개씩 동시에 요청
      async function worker() {
        while (next < list.length && current === job) {
          var index = next++;
          var w = list[index];
          var url = '/api/record/timeline?server=' + server + '&id=' + c.characterId +
            '&start=' + encodeURIComponent(w.start) + '&end=' + encodeURIComponent(w.end) + (w.last ? '&last=1' : '');
          results[index] = (await getJson(url)).records;
          done++;
          progress(done, list.length, w.start.slice(0, 7).replace('-', '.') + ' ~ ' + w.end.slice(0, 7).replace('-', '.') +
            ' 기록 확인 (' + done + ' / ' + list.length + ' 구간)');
        }
      }
      var workers = [];
      for (var i = 0; i < CONCURRENCY; i++) workers.push(worker());
      await Promise.all(workers);
      if (current !== job) return;

      records = [].concat.apply([], results).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      progress(1, 1, '완료: ' + list.length + '개 구간, 기록 ' + fmt(records.length) + '건');
      render(c);
    } catch (e) {
      if (current !== job) return;
      $('progressBox').hidden = true;
      message(e.message || '불러오지 못했습니다.');
    } finally {
      if (current === job) $('searchBtn').disabled = false;
    }
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var server = form.elements.server.value;
    var name = form.elements.name.value.trim();
    if (!name) return;
    history.replaceState(null, '', '?server=' + server + '&name=' + encodeURIComponent(name));
    search(server, name);
  });

  // ─── 결과 ───
  function render(c) {
    $('result').hidden = false;
    $('characterTitle').textContent = c.characterName + ' (' + (SERVERS[c.serverId] || c.serverId) + ')';
    $('characterSub').textContent = [c.jobGrowName, '명성 ' + fmt(c.fame || 0), c.adventureName ? '모험단 ' + c.adventureName : '']
      .filter(Boolean).join(' · ');
    renderSummary();
    renderItems();
    filter = 'all';
    document.querySelectorAll('#filter button').forEach(function (b) { b.classList.toggle('active', b.dataset.type === 'all'); });
    renderLog(true);
  }

  function count(list, fn) { return list.filter(fn).length; }

  function renderSummary() {
    var cards = ['enhance', 'amplify'].map(function (type) {
      var list = records.filter(function (r) { return r.type === type; });
      var ok = count(list, function (r) { return r.result; });
      return [TYPES[type] + ' 시도', fmt(list.length) + '회', '성공 ' + fmt(ok) + ' · 실패 ' + fmt(list.length - ok) + ' · 성공률 ' + pct(ok, list.length)];
    });
    var safe = records.filter(function (r) { return r.safe; });
    var ticket = records.filter(function (r) { return r.ticket; });
    cards.push(['안전 강화·증폭', fmt(safe.length) + '회', '성공 ' + fmt(count(safe, function (r) { return r.result; }))]);
    cards.push(['강화권·증폭권 사용', fmt(ticket.length) + '회', '성공 ' + fmt(count(ticket, function (r) { return r.result; }))]);
    $('summary').replaceChildren.apply($('summary'), cards.map(function (card) {
      var div = el('div');
      div.append(el('span', card[0]), el('strong', card[1]), el('em', card[2]));
      return div;
    }));
  }

  // 아이템별 요약 (같은 이름·종류끼리, 시도 많은 순)
  function renderItems() {
    var groups = {};
    records.forEach(function (r) {
      var key = r.type + '|' + r.item;
      var g = groups[key] || (groups[key] = { r: r, total: 0, ok: 0, safe: 0, ticket: 0, best: 0, last: r.date });
      g.total++;
      if (r.result) { g.ok++; g.best = Math.max(g.best, r.after); }
      if (r.safe) g.safe++;
      if (r.ticket) g.ticket++;
      if (r.date > g.last) g.last = r.date;
    });
    var rows = Object.keys(groups).map(function (k) { return groups[k]; })
      .sort(function (a, b) { return b.total - a.total; });
    var tbody = $('itemRows');
    tbody.replaceChildren();
    if (!rows.length) {
      var empty = el('tr');
      var td = el('td', '강화·증폭 기록이 없습니다.', 'muted');
      td.colSpan = 9;
      empty.append(td);
      tbody.append(empty);
      return;
    }
    rows.forEach(function (g) {
      var tr = el('tr');
      tr.append(
        el('td', g.r.item, 'item rarity-' + g.r.rarity),
        el('td', TYPES[g.r.type]),
        el('td', fmt(g.total)),
        el('td', fmt(g.ok), g.ok ? 'ok' : 'muted'),
        el('td', fmt(g.total - g.ok), g.total - g.ok ? 'fail' : 'muted'),
        el('td', g.safe ? fmt(g.safe) : '-', g.safe ? '' : 'muted'),
        el('td', g.ticket ? fmt(g.ticket) : '-', g.ticket ? '' : 'muted'),
        el('td', g.best ? '+' + g.best : '-'),
        el('td', g.last.slice(0, 10))
      );
      tbody.append(tr);
    });
  }

  function filtered() {
    return filter === 'all' ? records : records.filter(function (r) { return r.type === filter; });
  }

  // 전체 기록 (최신순, PAGE_SIZE 줄씩 더 보기)
  function renderLog(reset) {
    var list = filtered();
    var tbody = $('logRows');
    if (reset) { tbody.replaceChildren(); shown = 0; }
    if (!list.length) {
      var empty = el('tr');
      var td = el('td', '기록이 없습니다.', 'muted');
      td.colSpan = 7;
      empty.append(td);
      tbody.append(empty);
    }
    list.slice(shown, shown + PAGE_SIZE).forEach(function (r) {
      var tr = el('tr');
      tr.append(
        el('td', r.date),
        el('td', TYPES[r.type]),
        el('td', r.item, 'item rarity-' + r.rarity),
        el('td', '+' + r.before + ' → +' + r.after),
        el('td', r.result ? '성공' : '실패', r.result ? 'ok' : 'fail'),
        el('td', r.safe ? '안전' : '-', r.safe ? '' : 'muted'),
        el('td', r.ticket || '-', r.ticket ? '' : 'muted')
      );
      tbody.append(tr);
    });
    shown += PAGE_SIZE;
    $('moreBtn').hidden = shown >= list.length;
  }

  $('moreBtn').addEventListener('click', function () { renderLog(false); });
  $('filter').addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;
    filter = button.dataset.type;
    document.querySelectorAll('#filter button').forEach(function (b) { b.classList.toggle('active', b === button); });
    renderLog(true);
  });

  // 주소에 ?server=&name= 이 있으면 바로 검색 (공유한 주소로 들어온 경우)
  var params = new URLSearchParams(location.search);
  if (params.get('name')) {
    if (SERVERS[params.get('server')]) form.elements.server.value = params.get('server');
    form.elements.name.value = params.get('name');
    search(form.elements.server.value, form.elements.name.value.trim());
  }
})();
