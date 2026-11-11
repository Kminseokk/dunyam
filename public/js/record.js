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
      renderProfit(current);
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

  // ─── 기댓값 대비 손익 ───
  // 기댓값 계산기와 같은 확률·비용 표(/api/cost 기본값, 이벤트·보호권 가격·아이템 레벨 반영 없음)로
  //   단계 가치 V[n] = 0 → +n 까지의 평균 비용(골드·재료 따로)을 구하고
  //   시도 한 번의 손익 = V[시도 후 수치] − V[시도 전 수치] − 이번 시도 비용 으로 계산한다.
  //   (실패 기록의 after 는 시도한 수치라서, 실패 후 수치는 표의 실패 결과로 구한다)
  //   확률대로라면 시도 한 번의 손익 평균은 정확히 0 → 합계가 + 면 평균보다 이득, − 면 손해
  // 안전 강화·증폭과 강화권·증폭권 사용 기록은 비용 구조가 달라 제외한다.
  var PART_CHUNK = 15; // /api/record/parts 한 번에 보내는 아이템 수 (서버 ITEM_PARTS_MAX)
  var LUCK_TRIALS = 20000; // 운 백분위 시뮬레이션 횟수
  var costTables = null; // { enhance|amplify: { material, parts: { weapon|armor: { steps, V, max } } } }
  var partCache = {}; // 아이템 id → 'weapon' | 'armor' | null
  var stepChart = null;

  async function loadCostTables() {
    if (costTables) return costTables;
    var tables = {};
    await Promise.all(['enhance', 'amplify'].map(async function (type) {
      var data = await getJson('/api/cost?type=' + type);
      var parts = {};
      data.parts.forEach(function (p) {
        var steps = DyUpgrade.toArrays(p.steps);
        var D = DyUpgrade.stepCosts(steps, data.maxLevel, 0, 0);
        var V = [{ gold: 0, material: 0 }];
        for (var t = 1; t <= data.maxLevel; t++) {
          V[t] = { gold: V[t - 1].gold + D[t].gold, material: V[t - 1].material + D[t].material };
        }
        parts[p.id] = { steps: steps, V: V, max: data.maxLevel };
      });
      tables[type] = { material: data.material, parts: parts };
    }));
    return (costTables = tables);
  }

  // 아이템 부위를 PART_CHUNK 개씩 나눠 조회 (이미 아는 아이템은 건너뜀)
  async function loadParts(ids) {
    var need = ids.filter(function (id) { return !(id in partCache); });
    var chunks = [];
    for (var i = 0; i < need.length; i += PART_CHUNK) chunks.push(need.slice(i, i + PART_CHUNK));
    var next = 0;
    async function worker() {
      while (next < chunks.length) {
        var data = await getJson('/api/record/parts?ids=' + chunks[next++].join(','));
        Object.keys(data.parts).forEach(function (id) { partCache[id] = data.parts[id]; });
      }
    }
    await Promise.all([worker(), worker(), worker()]);
  }

  // 기록 한 건 → 손익 계산용 값. 계산할 수 없으면 제외 사유('safe' | 'ticket' | 'other')
  function evaluate(r) {
    if (r.safe) return 'safe';
    var t = r.before + 1;
    // 여러 단계를 한 번에 시도한 기록(예: +7 → +11)은 사용권 기록에 사용권 이름이 빠진 경우라 사용권으로 센다
    if (r.ticket || r.after !== t) return 'ticket';
    var part = partCache[r.itemId];
    var table = part && costTables[r.type].parts[part];
    if (!table || t > table.max) return 'other';
    var s = table.steps, V = table.V;
    var failLevel = DyUpgrade.levelAfterFail(s, t, 0);
    function gain(level) {
      return {
        gold: V[level].gold - V[r.before].gold - s.gold[t],
        material: V[level].material - V[r.before].material - s.material[t]
      };
    }
    return { key: r.type + '|' + part + '|' + t, type: r.type, t: t, p: s.rate[t], ok: gain(t), ng: gain(failLevel), result: r.result };
  }

  async function renderProfit(current) {
    $('profitStatus').textContent = '손익을 계산하는 중...';
    $('profitSummary').replaceChildren();
    $('profitChartBox').hidden = true;
    try {
      await loadCostTables();
      await loadParts(records.filter(function (r) { return !r.safe && !r.ticket && r.after === r.before + 1; })
        .map(function (r) { return r.itemId; })
        .filter(function (id, i, all) { return all.indexOf(id) === i; }));
    } catch (e) {
      if (current === job) $('profitStatus').textContent = '손익을 계산하지 못했습니다. (' + (e.message || '오류') + ')';
      return;
    }
    if (current !== job) return;

    var total = { enhance: { gold: 0, material: 0, n: 0 }, amplify: { gold: 0, material: 0, n: 0 } };
    var excluded = { safe: 0, ticket: 0, other: 0 };
    var groups = {}; // 같은 종류·부위·단계 시도 묶음 (운 백분위 시뮬레이션용)
    var steps = {}; // 종류·단계별 실제 성공률 (차트용)
    records.forEach(function (r) {
      var v = evaluate(r);
      if (typeof v === 'string') { excluded[v]++; return; }
      var got = v.result ? v.ok : v.ng;
      total[v.type].gold += got.gold;
      total[v.type].material += got.material;
      total[v.type].n++;
      var g = groups[v.key] || (groups[v.key] = { n: 0, p: v.p, ok: v.ok.gold, ng: v.ng.gold });
      g.n++;
      var sk = v.type + '|' + v.t;
      var st = steps[sk] || (steps[sk] = { type: v.type, t: v.t, p: v.p, n: 0, ok: 0 });
      st.n++;
      if (v.result) st.ok++;
    });

    var counted = total.enhance.n + total.amplify.n;
    if (!counted) {
      $('profitStatus').textContent = '손익을 계산할 기록이 없습니다.';
      return;
    }
    $('profitStatus').textContent = '';
    var actualGold = total.enhance.gold + total.amplify.gold;
    var top = luckTop(groups, actualGold);

    var cards = ['enhance', 'amplify'].map(function (type) {
      var x = total[type];
      if (!x.n) return [TYPES[type] + ' 손익', '-', '계산한 기록 없음', ''];
      return [TYPES[type] + ' 손익', signedGold(x.gold),
        costTables[type].material + ' ' + signed(Math.round(x.material)) + '개 · ' + fmt(x.n) + '회 기준', x.gold >= 0 ? 'gain' : 'loss'];
    });
    cards.push(['운 백분위', '상위 ' + fmtPct(top) + '%',
      '같은 시도를 확률대로 다시 하면 ' + fmtPct(top) + '%만 이보다 좋은 결과 (골드 손익, ' + fmt(LUCK_TRIALS) + '회 시뮬레이션)',
      top <= 50 ? 'gain' : 'loss']);
    cards.push(['계산 제외', fmt(excluded.safe + excluded.ticket + excluded.other) + '회',
      '안전 ' + fmt(excluded.safe) + ' · 사용권 ' + fmt(excluded.ticket) + ' · 기타 ' + fmt(excluded.other), '']);
    $('profitSummary').replaceChildren.apply($('profitSummary'), cards.map(function (card) {
      var div = el('div');
      div.append(el('span', card[0]), el('strong', card[1], card[3]), el('em', card[2]));
      return div;
    }));

    renderStepChart(Object.keys(steps).map(function (k) { return steps[k]; }));
  }

  function signed(n) { return (n > 0 ? '+' : '') + fmt(n); }
  function signedGold(n) { return (n > 0 ? '+' : '') + DyUpgrade.fmtGold(n); }
  function fmtPct(n) { return n < 1 ? n.toFixed(2) : n < 10 ? n.toFixed(1) : String(Math.round(n)); }

  // 운 백분위: 같은 시도(종류·부위·단계별 횟수)를 확률대로 LUCK_TRIALS 번 다시 했을 때
  // 실제 골드 손익 이상이 나오는 비율(%) → 작을수록 운이 좋았다
  function luckTop(groups, actual) {
    var list = Object.keys(groups).map(function (k) { return groups[k]; });
    var better = 0;
    for (var i = 0; i < LUCK_TRIALS; i++) {
      var sum = 0;
      list.forEach(function (g) {
        var k = binomial(g.n, g.p);
        sum += k * g.ok + (g.n - k) * g.ng;
      });
      if (sum >= actual - 1e-6) better++;
    }
    return (better / LUCK_TRIALS) * 100;
  }

  // 이항분포 표본: 분산이 크면 정규 근사, 작으면 확률을 차례로 누적 (성공이 많으면 실패 쪽으로 뒤집어 계산)
  function binomial(n, p) {
    if (p >= 1) return n;
    if (p <= 0) return 0;
    if (p > 0.5) return n - binomial(n, 1 - p);
    var mean = n * p, variance = mean * (1 - p);
    if (variance > 25) {
      var z = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
      return Math.min(n, Math.max(0, Math.round(mean + Math.sqrt(variance) * z)));
    }
    var u = Math.random(), q = Math.pow(1 - p, n), cum = q, k = 0;
    while (u > cum && k < n) {
      q *= ((n - k) / (k + 1)) * (p / (1 - p));
      k++;
      cum += q;
    }
    return k;
  }

  // 단계별 실제 성공률(막대) vs 공식 확률(점). 확률 100% 단계는 뺀다
  function renderStepChart(list) {
    list = list.filter(function (s) { return s.p < 1; })
      .sort(function (a, b) { return a.type === b.type ? a.t - b.t : a.type === 'enhance' ? -1 : 1; });
    if (stepChart) { stepChart.destroy(); stepChart = null; }
    $('profitChartBox').hidden = !list.length;
    if (!list.length) return;
    var actual = list.map(function (s) { return Math.round((s.ok / s.n) * 1000) / 10; });
    stepChart = new Chart($('stepChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: list.map(function (s) { return TYPES[s.type] + ' +' + (s.t - 1) + '→+' + s.t; }),
        datasets: [
          {
            type: 'bar', label: '실제 성공률', data: actual, maxBarThickness: 36, borderRadius: 4, order: 1,
            backgroundColor: list.map(function (s, i) { return actual[i] >= s.p * 100 ? 'rgba(74, 144, 255, 0.8)' : 'rgba(255, 107, 107, 0.8)'; })
          },
          {
            type: 'line', label: '공식 확률', data: list.map(function (s) { return Math.round(s.p * 1000) / 10; }),
            showLine: false, pointStyle: 'line', pointRadius: 14, pointBorderWidth: 3, borderColor: '#ffd43b', backgroundColor: '#ffd43b',
            order: 0 // 막대 위에 그린다
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#c8c8c8' } },
          tooltip: {
            callbacks: {
              label: function (c) { return c.dataset.label + ' ' + c.parsed.y + '%'; },
              afterBody: function (items) { var s = list[items[0].dataIndex]; return fmt(s.n) + '회 중 ' + fmt(s.ok) + '회 성공'; }
            }
          }
        },
        scales: {
          x: { ticks: { color: '#aaa' }, grid: { display: false } },
          y: { beginAtZero: true, max: 100, ticks: { color: '#aaa', callback: function (v) { return v + '%'; } }, grid: { color: 'rgba(255, 255, 255, 0.08)' } }
        }
      }
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
