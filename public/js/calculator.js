(function () {
  'use strict';

  // 계산기 종류. 단계별 확률·비용은 서버(src/cost.ts)에서 /api/cost 로 받아온다.
  //   tabs: 이 계산기 페이지 안에 보여 줄 탭 (같은 묶음의 계산기들)
  //   info: 제목 옆 느낌표 아이콘에 마우스를 올리면 보이는 설명 (한 줄씩)
  var COMMON_INFO = ['평균은 확률식으로 정확히 계산하고, 그래프와 상위 N%는 10만 회 시뮬레이션 결과입니다.'];
  var MODES = {
    enhance: {
      title: '강화 기댓값 계산기', unit: '개', storageKey: 'dy-calc-enhance', tabs: 'enhance',
      info: [
        '확률·비용은 나무위키 강화 표 기준이며, 골드는 100레벨 장비 기준입니다.',
        '실패 시 무기는 +11·+12 시도에서 3단계 하락, +13 시도부터 파괴됩니다. 그 외 장비는 +11 시도부터 파괴됩니다.',
        '파괴되면 새 장비로 0부터 다시 시작하며, 파괴될 때마다 보호권 가격을 더합니다.',
        '일반 강화는 실패해도 성공 확률 보정치가 없습니다.',
        '칭호·코스튬·이벤트 등 확률 보정은 \'확률 상승 및 이벤트\'에서 체크한 항목만 반영됩니다.',
        '강화는 +18 까지의 정보만이 있어서 +18까지가 최대 수치입니다.'
      ]
    },
    safe: {
      title: '안전 강화 기댓값 계산기', unit: '개', storageKey: 'dy-calc-safe', tabs: 'enhance',
      info: [
        '무기 전용이며 골드와 라이언 코어를 소모합니다. 최대 +12까지 가능합니다.',
        '실패해도 강화 수치가 내려가거나 파괴되지 않습니다.',
        '실패할 때마다 그 단계의 성공 확률이 올라가며(+5~+10: 5%p, +11·+12: 2%p), 성공하면 초기화된다고 가정합니다.'
      ]
    },
    amplify: {
      title: '증폭 기댓값 계산기', unit: '개', storageKey: 'dy-calc-amplify', tabs: 'amplify',
      info: [
        '확률·모순의 결정체 소모량은 나무위키 증폭 표(2021-12-02 확률 공개 기준)이며, 골드는 100레벨 에픽 기준으로 1회마다 고정입니다.',
        '실패 시 +5~+7 시도는 1단계, +8~+10 시도는 3단계 하락하고, +11 시도부터 파괴됩니다.',
        '파괴되면 새 장비로 0부터 다시 시작하며, 파괴될 때마다 보호권 가격을 더합니다.',
        '증폭은 실패해도 성공 확률 보정치가 없습니다.',
        '\'+10까지 안전 증폭 및 증폭대란 이용\'을 체크하면 +10까지는 안전 증폭(증폭 대란 적용) 평균 비용으로 고정합니다.',
        '증폭는 +13 까지의 정보만이 있어서 +13까지가 최대 수치입니다. 추후 업데이트 예정입니다.'
      ]
    },
    'safe-amplify': {
      title: '안전 증폭 기댓값 계산기', unit: '개', storageKey: 'dy-calc-safe-amplify', tabs: 'amplify',
      info: [
        '장착 레벨 100 이상, 유니크 이상, +9 이하 장비에 가능하며 최대 +10까지입니다.',
        '골드와 조화의 결정체를 소모하며, 무기와 무기 외 장비의 소모량이 다릅니다.',
        '실패해도 증폭 수치가 내려가거나 파괴되지 않습니다.',
        '실패할 때마다 그 단계의 성공 확률이 올라가며(+5~+7: 10%p, +8~+10: 5%p), 성공하면 초기화된다고 가정합니다.',
        '\'증폭 대란\'은 2023 신년 이벤트 공지 기준(+7까지 100%, +8~+10 +10%p)이며, 실패 보정치는 그 위에 더해집니다.'
      ]
    }
  };
  var TABS = {
    enhance: [['enhance', '강화'], ['safe', '안전 강화']],
    amplify: [['amplify', '증폭'], ['safe-amplify', '안전 증폭']]
  };

  // 확률 상승 및 이벤트: 체크하면 자동 보정 (계산기별)
  //   rate: 성공 확률 더하기(%p, 0.01 = 1%p) / gold·material: 비용 할인율(0.5 = 50%)
  //   setRate: 목표 수치별 성공 확률 지정 ({ '1-9': 1 } = +1~+9 시도 100%)
  //   addRate: 목표 수치별 성공 확률 더하기 ({ '8-10': 0.1 } = +8~+10 시도 +10%p)
  //   적용 순서: setRate(지정) → addRate·rate(더하기). 안전 강화·증폭의 실패 보정치는 계산할 때 그 위에 더한다.
  //   effect: (선택) 화면에 보여 줄 효과 설명. 없으면 rate·할인율로 자동 생성
  var EVENT_OPTIONS = {
    enhance: [
      { id: 'secret', label: '강화의 비밀', rate: 0.01 },
      { id: 'kiri', label: '키리 칭호', rate: 0.01 },
      { id: 'costume', label: '코스튬', rate: 0.01 },
      { id: 'daeran', label: '(구) 강화대란', setRate: { '1-9': 1, 10: 0.5 }, effect: '+1~+9 100%, +9→+10 50%' }
    ],
    // 2023 신년 안전 증폭 이벤트 공지 기준: 100% 구간 +4 → +7 확장, +10까지 확률 10% 상승
    'safe-amplify': [
      { id: 'amp-daeran', label: '증폭 대란', setRate: { '1-7': 1 }, addRate: { '8-10': 0.1 }, effect: '+1~+7 100%, +8~+10 +10%p' }
    ]
  };
  var MAX_ATTEMPTS_PER_TRIAL = 1000000; // 확률이 너무 낮을 때 무한 반복 방지
  var FAIL_LABELS = { keep: '유지', destroy: '파괴', reset: '0으로 초기화' };

  var mode = location.pathname.split('/')[2];
  if (!MODES[mode]) mode = 'enhance';
  var cfg = MODES[mode];
  var table = null; // /api/cost 응답

  function $(id) { return document.getElementById(id); }
  function num(v) { var n = Number(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  // 입력값을 숫자만 남겨 천 단위 쉼표로 표시 (예: '1234567' → '1,234,567')
  function withCommas(v) { return String(v || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  // 골드는 조/억/만 단위로 표시 (가장 큰 두 단위까지)
  function fmtGold(n) {
    n = Math.round(n);
    if (n < 10000) return n.toLocaleString() + '골드';
    var units = [[1e12, '조'], [1e8, '억'], [1e4, '만'], [1, '']];
    for (var i = 0; i < units.length - 1; i++) {
      var big = units[i][0];
      if (n < big) continue;
      var small = units[i + 1];
      var head = Math.floor(n / big);
      var tail = small ? Math.round((n % big) / small[0]) : 0;
      if (small && tail * small[0] >= big) { head++; tail = 0; }
      return head.toLocaleString() + units[i][1] + ' ' + (tail ? tail.toLocaleString() + small[1] + (small[1] ? ' ' : '') : '') + '골드';
    }
  }
  // 그래프 축용: 억 단위로만 간략히 (예: 0.35억, 1.2억, 12억)
  function fmtEok(n) {
    var eok = n / 1e8;
    var digits = eok < 1 ? 2 : eok < 10 ? 1 : 0;
    return Number(eok.toFixed(digits)).toLocaleString() + '억';
  }
  function fmtTimes(n) {
    return (n < 100 ? n.toFixed(n < 10 ? 2 : 1) : Math.round(n).toLocaleString()) + '회';
  }
  function fmtCount(n) { return Math.round(n).toLocaleString() + cfg.unit; }
  function failLabel(fail) {
    var down = /^down(\d+)$/.exec(fail);
    return down ? down[1] + '단계 하락' : FAIL_LABELS[fail] || fail;
  }

  // ─── 화면 초기화 ───
  document.title = cfg.title + ' - 던전앤파이터 모험단 검색 사이트';
  $('calcTitle').textContent = cfg.title;
  $('calcInfoTip').replaceChildren.apply($('calcInfoTip'), cfg.info.concat(COMMON_INFO).map(function (line) {
    var p = document.createElement('span');
    p.textContent = '· ' + line;
    return p;
  }));
  TABS[cfg.tabs].forEach(function (tab) {
    var a = document.createElement('a');
    a.href = '/calculator/' + tab[0];
    a.textContent = tab[1];
    if (tab[0] === mode) a.className = 'active';
    $('calcTabs').append(a);
  });

  // ─── 설정 저장/복원 (브라우저에만 저장) ───
  // 이벤트: 체크한 옵션 id 목록
  var eventOptions = EVENT_OPTIONS[mode] || [];
  var state = load();
  function load() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(cfg.storageKey)); } catch (e) { /* 저장소 사용 불가 */ }
    var s = Object.assign({ part: '', current: '', target: '', destroyCost: '', safeTo10: false }, saved || {});
    if (!Array.isArray(s.events)) s.events = [];
    delete s.event; // 이전 버전의 직접 입력 이벤트 값
    delete s.destroyMode; // 이전 버전의 파괴 시 선택 (약속과 믿음 옵션 삭제)
    return s;
  }
  function save() {
    try { localStorage.setItem(cfg.storageKey, JSON.stringify(state)); } catch (e) { /* 저장소 사용 불가 */ }
  }

  $('currentLevel').value = state.current;
  $('targetLevel').value = state.target;
  $('destroyCost').value = withCommas(state.destroyCost);
  renderEventOptions();

  // ─── 확률 상승 및 이벤트 (체크박스) ───
  function renderEventOptions() {
    $('eventBox').hidden = !eventOptions.length;
    var box = $('eventOptions');
    box.replaceChildren();
    eventOptions.forEach(function (o) {
      var label = document.createElement('label');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.value = o.id;
      input.checked = state.events.indexOf(o.id) >= 0;
      var name = document.createElement('span');
      name.textContent = o.label;
      var effect = document.createElement('em');
      effect.textContent = o.effect || optionEffect(o);
      label.append(input, name, effect);
      box.append(label);
    });
    showEventTotal();
  }
  function optionEffect(o) {
    var parts = [];
    if (o.rate) parts.push('확률 +' + Math.round(o.rate * 10000) / 100 + '%p');
    if (o.gold) parts.push('골드 ' + Math.round(o.gold * 100) + '% 할인');
    if (o.material) parts.push('재료 ' + Math.round(o.material * 100) + '% 할인');
    return parts.join(', ');
  }
  // { '1-9': v, 10: w } 형태를 목표 수치별로 펼쳐서 fn(목표 수치, 값) 호출
  function eachTarget(byRange, fn) {
    Object.keys(byRange || {}).forEach(function (key) {
      var range = String(key).split('-').map(Number);
      for (var t = range[0]; t <= (range[1] || range[0]); t++) fn(t, byRange[key]);
    });
  }
  // 체크한 옵션 효과 합계 (setRate: 겹치면 높은 값 / addRate: 더함)
  function eventTotals() {
    var total = { rate: 0, gold: 0, material: 0, setRate: {}, addRate: {}, effects: [] };
    eventOptions.forEach(function (o) {
      if (state.events.indexOf(o.id) < 0) return;
      total.rate += o.rate || 0;
      total.gold += o.gold || 0;
      total.material += o.material || 0;
      eachTarget(o.setRate, function (t, v) { total.setRate[t] = Math.max(total.setRate[t] || 0, v); });
      eachTarget(o.addRate, function (t, v) { total.addRate[t] = (total.addRate[t] || 0) + v; });
      if (o.setRate || o.addRate) total.effects.push(o.label);
    });
    total.gold = Math.min(1, total.gold);
    total.material = Math.min(1, total.material);
    return total;
  }
  function showEventTotal() {
    var ev = eventTotals();
    var text = [optionEffect(ev)].concat(ev.effects).filter(Boolean).join(', ');
    $('eventTotal').textContent = text ? '적용 중: ' + text : '';
  }

  $('eventOptions').addEventListener('change', function (e) {
    var id = e.target.value;
    state.events = state.events.filter(function (x) { return x !== id; });
    if (e.target.checked) state.events.push(id);
    save();
    showEventTotal();
    renderRows();
  });
  $('eventReset').addEventListener('click', function () {
    state.events = [];
    save();
    renderEventOptions();
    renderRows();
  });

  function maxLevel() { return table ? table.maxLevel : 0; }
  function partSteps() {
    var part = table && (table.parts.filter(function (p) { return p.id === $('part').value; })[0] || table.parts[0]);
    return part ? part.steps : [];
  }

  // 이벤트를 반영한 단계별 값 (base: 원래 값, changed: 이벤트로 바뀐 항목)
  function eventSteps() {
    var ev = eventTotals();
    return partSteps().map(function (s) {
      var baseRate = ev.setRate[s.target] != null ? ev.setRate[s.target] : s.rate;
      var adjusted = {
        rate: Math.min(1, baseRate + (ev.addRate[s.target] || 0) + ev.rate),
        gold: s.gold * (1 - ev.gold),
        material: s.material * (1 - ev.material)
      };
      var changed = {};
      ['rate', 'gold', 'material'].forEach(function (key) { changed[key] = Math.abs(adjusted[key] - s[key]) > 1e-12; });
      return Object.assign({}, s, adjusted, { base: s, changed: changed });
    });
  }

  // ─── 증폭: +10까지 안전 증폭 + 증폭 대란 이용 ───
  // +10까지는 안전 증폭(대란 적용) 평균 비용으로 고정하고, 그 이후만 일반 증폭으로 계산한다.
  var SAFE_TO = 10;
  var safeTable = null; // 안전 증폭 표 (일반 증폭 계산기에서만 불러옴)
  function useSafeTo10() { return mode === 'amplify' && state.safeTo10 && !!safeTable; }
  // 선택한 부위의 안전 증폭 단계에 증폭 대란(EVENT_OPTIONS 의 정의)을 적용
  function safeDaeranSteps() {
    var daeran = (EVENT_OPTIONS['safe-amplify'] || []).filter(function (o) { return o.id === 'amp-daeran'; })[0] || {};
    var set = {}, add = {};
    eachTarget(daeran.setRate, function (t, v) { set[t] = v; });
    eachTarget(daeran.addRate, function (t, v) { add[t] = v; });
    var part = safeTable.parts.filter(function (p) { return p.id === $('part').value; })[0] || safeTable.parts[0];
    return part.steps.map(function (s) {
      var rate = set[s.target] != null ? set[s.target] : s.rate;
      return Object.assign({}, s, { rate: Math.min(1, rate + (add[s.target] || 0)) });
    });
  }
  // 안전 증폭 구간(from → to)의 평균 비용 (파괴 없음)
  function safeFixedCost(from, to) {
    if (to <= from) return { gold: 0, material: 0, attempts: 0 };
    return exactExpectation(toArrays(safeDaeranSteps().slice(0, to)), { current: from, target: to }, 0);
  }

  function levels() {
    var current = Math.max(0, Math.floor(num($('currentLevel').value)));
    var target = Math.floor(num($('targetLevel').value));
    return { current: current, target: target };
  }
  function validLevels(lv) { return lv.target > lv.current && lv.target <= maxLevel(); }

  // ─── 단계별 표 (읽기 전용) ───
  function cell(text, className, title) {
    var td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    if (title) td.title = title;
    return td;
  }
  function fmtRate(r) { return (Math.round(r * 10000) / 100) + '%'; }
  function fmtStepGold(g) { return Math.round(g).toLocaleString() + '골드'; }
  function fmtStepMaterial(m) { return (Math.round(m * 100) / 100).toLocaleString() + cfg.unit; }
  // 이벤트로 바뀐 칸은 강조하고 기본값을 툴팁으로
  function eventCell(s, key, format) {
    return s.changed[key] ? cell(format(s[key]), 'evented', '기본 ' + format(s.base[key])) : cell(format(s[key]));
  }

  function renderRows() {
    var lv = levels();
    var tbody = $('stepRows');
    tbody.replaceChildren();
    if (!table) return;
    if (!validLevels(lv)) {
      var tr = document.createElement('tr');
      var td = cell('현재 수치와 목표 수치(최대 +' + maxLevel() + ')를 입력하면 해당 단계의 확률·비용이 나옵니다.', 'calc-hint');
      td.colSpan = 5;
      tr.append(td);
      tbody.append(tr);
      return;
    }
    var safeRows = useSafeTo10() ? safeDaeranSteps() : null;
    eventSteps().slice(0, lv.target).forEach(function (s) {
      var row = document.createElement('tr');
      if (s.target <= lv.current) row.className = 'below';
      if (safeRows && s.target <= SAFE_TO) {
        // +10까지는 안전 증폭(증폭 대란) 값으로 표시
        var safe = safeRows[s.target - 1];
        var note = '안전 증폭 + 증폭 대란 (평균 비용으로 고정)';
        row.append(
          cell('+' + (s.target - 1) + ' → +' + s.target),
          cell(fmtRate(safe.rate), 'evented', note),
          cell(fmtStepGold(safe.gold), 'evented', note),
          cell(safeTable.material + ' ' + safe.material.toLocaleString() + cfg.unit, 'evented', note),
          cell('유지' + (safe.failBonus ? ' · 확률 +' + Math.round(safe.failBonus * 10000) / 100 + '%p 누적' : ''), '', note)
        );
        tbody.append(row);
        return;
      }
      row.append(
        cell('+' + (s.target - 1) + ' → +' + s.target),
        eventCell(s, 'rate', fmtRate),
        eventCell(s, 'gold', fmtStepGold),
        eventCell(s, 'material', fmtStepMaterial),
        cell(failLabel(s.fail) + (s.failBonus ? ' · 확률 +' + Math.round(s.failBonus * 10000) / 100 + '%p 누적' : ''),
          s.fail === 'destroy' ? 'destroy' : /^down/.test(s.fail) ? 'down' : '',
          s.failBonus ? '실패할 때마다 이 단계 성공 확률이 올라가고, 성공하면 초기화됩니다.' : '')
      );
      tbody.append(row);
    });
  }

  ['currentLevel', 'targetLevel'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      state.current = $('currentLevel').value;
      state.target = $('targetLevel').value;
      save();
      renderRows();
    });
  });
  $('part').addEventListener('change', function () { state.part = $('part').value; save(); renderRows(); });
  $('destroyCost').addEventListener('input', function () {
    // 숫자만 남기고 천 단위 쉼표를 넣되, 커서는 같은 숫자 뒤에 유지
    var input = this;
    var digitsBefore = input.value.slice(0, input.selectionStart).replace(/\D/g, '').length;
    input.value = withCommas(input.value);
    var pos = 0;
    for (var seen = 0; pos < input.value.length && seen < digitsBefore; pos++) if (/\d/.test(input.value[pos])) seen++;
    input.setSelectionRange(pos, pos);
    state.destroyCost = input.value.replace(/,/g, '');
    save();
  });
  $('safeTo10').checked = !!state.safeTo10;
  $('safeTo10').addEventListener('change', function () { state.safeTo10 = this.checked; save(); renderRows(); });

  // ─── 확률·비용 표 불러오기 ───
  $('runBtn').disabled = true;
  fetch('/api/cost?type=' + mode)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.message);
      table = data;
      $('calcSource').hidden = true;
      $('materialHead').textContent = data.material;
      $('materialTitle').textContent = '소모 ' + data.material;
      $('materialUnit').textContent = cfg.unit;
      $('targetLevel').max = data.maxLevel;
      $('currentLevel').max = data.maxLevel - 1;
      data.parts.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        $('part').append(opt);
      });
      if (state.part) $('part').value = state.part;
      // 세부 설정(장비 파괴 시 처리)은 파괴 단계가 있는 계산기에서만 표시 (안전 강화는 파괴 없음)
      $('detailBox').hidden = !data.parts.some(function (p) {
        return p.steps.some(function (s) { return s.fail === 'destroy'; });
      });
      $('runBtn').disabled = false;
      renderRows();
      // 일반 증폭: '+10까지 안전 증폭 및 증폭대란 이용' 옵션용으로 안전 증폭 표도 불러온다
      if (mode === 'amplify') {
        return fetch('/api/cost?type=safe-amplify')
          .then(function (res) { return res.json(); })
          .then(function (safe) {
            if (!safe.ok) return;
            safeTable = safe;
            $('safeTo10Box').hidden = false;
            renderRows();
          });
      }
    })
    .catch(function (e) {
      $('calcSource').textContent = e.message || '확률·비용 표를 불러오지 못했습니다.';
      message('이 계산기는 아직 확률·비용 데이터가 준비되지 않았습니다.');
    });

  // ─── 시뮬레이션 ───
  var running = null;

  function message(text, progress) {
    $('calcMessage').textContent = text;
    $('calcMessage').classList.toggle('progress', !!progress);
  }

  // 시뮬레이션용 배열 (인덱스 = 목표 수치, drop 은 하락 단계 수 / -1 = 파괴 / 0 = 유지, bonus = 실패 시 누적 확률)
  function buildSteps(lv) { return toArrays(eventSteps().slice(0, lv.target)); }
  function toArrays(list) {
    var rate = [], gold = [], material = [], drop = [], bonus = [];
    list.forEach(function (s) {
      var down = /^down(\d+)$/.exec(s.fail);
      rate[s.target] = s.rate;
      gold[s.target] = s.gold;
      material[s.target] = s.material;
      drop[s.target] = s.fail === 'destroy' ? -1 : s.fail === 'reset' ? Infinity : down ? Number(down[1]) : 0;
      bonus[s.target] = s.failBonus || 0;
    });
    return { rate: rate, gold: gold, material: material, drop: drop, bonus: bonus };
  }

  // ─── 평균: 확률식으로 정확히 계산 ───
  // 단계 t 를 "통과"(t-1 → t)하는 데 드는 기댓값 D[t] 를 아래 단계부터 차례로 구해 더한다.
  //   N = 단계 t 에서 성공할 때까지의 시도 횟수. 실패할 때마다 보정치가 쌓이고 성공하면 초기화되므로
  //       N 의 분포는 다른 단계와 무관하다 → E[N] = Σ P(n번째 시도까지 계속 실패)
  //   D[t] = E[N]·(1회 비용) + (E[N]-1)·(실패 후 t-1 까지 다시 올라오는 비용 + 파괴 비용)
  //   다시 올라오는 비용 = 실패 후 수치 a 에서 t-1 까지 D[a+1] + … + D[t-1] (그 단계들도 보정치가 새로 시작)
  // 목표까지의 기댓값 = D[현재+1] + … + D[목표]
  function expectedTries(p, bonus) {
    if (p >= 1) return 1;
    if (!(bonus > 0)) return 1 / p;
    var e = 0, survive = 1;
    for (var n = 0; survive > 1e-15; n++) {
      e += survive;
      survive *= 1 - Math.min(1, p + n * bonus);
    }
    return e;
  }

  // 파괴되면 새 장비로 floor(기본 0)부터 다시 시작한다
  function exactExpectation(steps, lv, destroyCost, floor) {
    var keys = ['gold', 'material', 'attempts', 'destroys'];
    var D = [];
    for (var t = 1; t <= lv.target; t++) {
      var drop = steps.drop[t];
      var destroy = drop === -1;
      // 새 장비로 다시 시작하면 보정치도 사라진다
      var tries = expectedTries(steps.rate[t], destroy ? 0 : steps.bonus[t]);
      var after = destroy ? floor || 0 : drop === Infinity ? 0 : drop ? Math.max(0, t - 1 - drop) : t - 1;
      var cost = { gold: steps.gold[t], material: steps.material[t], attempts: 1, destroys: 0 };
      var extra = destroy ? { gold: destroyCost, destroys: 1 } : {};
      D[t] = {};
      keys.forEach(function (key) {
        var climb = 0;
        for (var s = after + 1; s < t; s++) climb += D[s][key];
        D[t][key] = tries * cost[key] + (tries - 1) * (climb + (extra[key] || 0));
      });
    }
    var result = {};
    keys.forEach(function (key) {
      result[key] = 0;
      for (var t2 = lv.current + 1; t2 <= lv.target; t2++) result[key] += D[t2][key];
    });
    return result;
  }
  // ─── 분포: 시뮬레이션 (계산량이 감당 가능할 때만) ───
  var SIM_TRIALS = 100000; // 분포 시뮬레이션 횟수 (고정)
  var SIM_ATTEMPT_BUDGET = 5e8; // 한 번 계산에 쓰는 최대 강화 시도 수 (브라우저 부담 제한)
  var SIM_MAX_MEAN_ATTEMPTS = SIM_ATTEMPT_BUDGET / SIM_TRIALS; // 평균 시도가 이보다 많으면(5,000회) 분포 생략

  function run() {
    var lv = levels();
    if (!table) return;
    if (!validLevels(lv)) {
      message('목표 수치는 현재 수치보다 크고 +' + maxLevel() + ' 이하여야 합니다.');
      return;
    }
    if (running) { running.cancelled = true; running = null; }
    var steps = buildSteps(lv);
    var destroyCost = num($('destroyCost').value);

    // +10까지 안전 증폭(증폭 대란) 이용: +10까지는 평균 비용으로 고정, 그 이후만 일반 증폭
    var safe = useSafeTo10();
    var fixed = { gold: 0, material: 0, attempts: 0 }; // 현재 → +10 안전 증폭
    var restart = { gold: 0, material: 0, attempts: 0 }; // 새 장비로 0 → +10 다시 안전 증폭
    var floor = 0, destroyExtra = destroyCost, simLv = lv;
    if (safe) {
      fixed = safeFixedCost(lv.current, Math.min(SAFE_TO, lv.target));
      restart = safeFixedCost(0, SAFE_TO);
      floor = SAFE_TO;
      destroyExtra = destroyCost + restart.gold;
      simLv = { current: Math.max(lv.current, SAFE_TO), target: lv.target };
    }
    var normal = simLv.target > simLv.current
      ? exactExpectation(steps, simLv, destroyExtra, floor)
      : { gold: 0, material: 0, attempts: 0, destroys: 0 };
    var exact = {
      gold: fixed.gold + normal.gold,
      material: normal.material,
      attempts: fixed.attempts + normal.attempts + normal.destroys * restart.attempts,
      destroys: normal.destroys
    };
    if (safe) exact.safeMaterial = fixed.material + normal.destroys * restart.material;
    showAverages(exact);

    var safeNote = safe ? '+10까지의 안전 증폭 비용은 평균값으로 고정해 더했습니다.' : '';
    if (safe && lv.target <= SAFE_TO) {
      clearDistribution('목표가 +10 이하라 안전 증폭 평균 비용만 계산했습니다. (분포 그래프 생략)');
      message('');
      return;
    }
    if (normal.attempts > SIM_MAX_MEAN_ATTEMPTS) {
      clearDistribution('평균 강화 횟수가 ' + Math.round(normal.attempts).toLocaleString() + '회로 너무 많아 분포 그래프는 생략했습니다. 평균은 정확한 값입니다.');
      message('');
      return;
    }
    var trials = SIM_TRIALS;

    var job = { cancelled: false, done: 0, aborted: false, gold: new Float64Array(trials), material: new Float64Array(trials) };
    running = job;
    $('runBtn').disabled = true;
    $('cancelBtn').disabled = false;
    message('분포 계산 중... 0%', true);

    var fails = new Array(lv.target + 1); // 단계별 마지막 성공 이후 실패 횟수 (보정치)
    function trial() {
      var level = simLv.current, g = fixed.gold, m = 0, attempts = 0;
      fails.fill(0);
      while (level < lv.target) {
        var t = level + 1;
        g += steps.gold[t];
        m += steps.material[t];
        if (++attempts > MAX_ATTEMPTS_PER_TRIAL) { job.aborted = true; break; }
        if (Math.random() < steps.rate[t] + steps.bonus[t] * fails[t]) { level = t; fails[t] = 0; continue; }
        fails[t]++;
        var drop = steps.drop[t];
        if (drop === -1) { // 파괴
          level = floor;
          g += destroyExtra;
          fails.fill(0); // 새 장비: 보정치 초기화
        } else if (drop) level = Math.max(0, level - drop);
      }
      return [g, m];
    }

    // UI 가 멈추지 않도록 조금씩 나눠서 계산
    function chunk() {
      if (job.cancelled) return;
      var until = performance.now() + 30;
      while (job.done < trials && performance.now() < until && !job.aborted) {
        var r = trial();
        job.gold[job.done] = r[0];
        job.material[job.done] = r[1];
        job.done++;
      }
      if (job.aborted) {
        finish(job);
        clearDistribution('일부 경우의 강화 횟수가 너무 많아 분포 그래프는 생략했습니다. 평균은 정확한 값입니다.');
        return;
      }
      if (job.done < trials) {
        message('분포 계산 중... ' + Math.floor((job.done / trials) * 100) + '%', true);
        setTimeout(chunk, 0);
        return;
      }
      finish(job);
      showDistribution(job, trials);
      $('distNote').textContent = safeNote;
    }
    setTimeout(chunk, 0);
  }

  function finish(job, text) {
    if (running === job) running = null;
    $('runBtn').disabled = false;
    $('cancelBtn').disabled = true;
    message(text || '', !!text);
  }

  $('runBtn').addEventListener('click', run);
  $('cancelBtn').addEventListener('click', function () {
    if (!running) return;
    running.cancelled = true;
    finish(running);
    clearDistribution('분포 계산을 취소했습니다. 평균은 정확한 값입니다.');
  });

  // ─── 결과 ───
  var charts = {};
  var sorted = {};
  var summaryValues = {};

  // 상위 N% (운 좋은 순) 값
  function percentileValue(arr, pct) {
    var i = Math.min(arr.length - 1, Math.max(0, Math.ceil((pct / 100) * arr.length) - 1));
    return arr[i];
  }
  // 이 값 이하로 성공한 비율(%)
  function percentOf(arr, value) {
    var lo = 0, hi = arr.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] <= value) lo = mid + 1; else hi = mid; }
    return (lo / arr.length) * 100;
  }

  function renderSummary() {
    var v = summaryValues;
    var items = [
      ['평균 시도 횟수', v.attempts],
      ['평균 파괴 횟수', v.destroys],
      ['중앙값 골드 (상위 50%)', v.median || '-'],
      ['분포 시뮬레이션', v.trials || '-']
    ];
    if (v.safeMaterial) items.splice(2, 0, ['평균 ' + safeTable.material + ' (안전 증폭)', v.safeMaterial]);
    $('summary').replaceChildren.apply($('summary'), items.map(function (s) {
      var div = document.createElement('div');
      var label = document.createElement('span');
      var value = document.createElement('strong');
      label.textContent = s[0];
      value.textContent = s[1];
      div.append(label, value);
      return div;
    }));
  }

  function showAverages(exact) {
    $('goldAvg').textContent = fmtGold(exact.gold);
    $('materialAvg').textContent = fmtCount(exact.material);
    summaryValues = { attempts: fmtTimes(exact.attempts), destroys: fmtTimes(exact.destroys) };
    if (exact.safeMaterial > 0) summaryValues.safeMaterial = fmtCount(exact.safeMaterial);
    renderSummary();
    clearDistribution('');
  }

  function clearDistribution(reason) {
    Object.keys(charts).forEach(function (id) { charts[id].destroy(); delete charts[id]; });
    sorted = {};
    document.querySelectorAll('.calc-percentile input').forEach(function (input) { input.value = ''; input.disabled = !!reason; });
    $('distNote').textContent = reason;
    $('goldChart').closest('.calc-box').classList.toggle('no-dist', !!reason); // 분포 생략 시 그래프 영역 숨김
  }

  function showDistribution(job, trials) {
    sorted.gold = job.gold.slice().sort();
    sorted.material = job.material.slice().sort();
    summaryValues.median = fmtGold(percentileValue(sorted.gold, 50));
    summaryValues.trials = trials.toLocaleString() + '회';
    renderSummary();
    $('distNote').textContent = '';

    histogram('goldChart', sorted.gold, '골드', fmtEok);
    histogram('materialChart', sorted.material, table.material, fmtCount);

    document.querySelectorAll('.calc-percentile').forEach(function (box) {
      box.querySelectorAll('input').forEach(function (input) { input.disabled = false; });
      box.querySelector('.pct').value = 50;
      box.querySelector('.val').value = Math.round(percentileValue(sorted[box.dataset.metric], 50));
    });
  }

  // 분포 그래프 (상위 0.1% 생략)
  function histogram(id, arr, label, format) {
    var bins = 40;
    var lo = arr[0];
    var hi = arr[Math.floor((arr.length - 1) * 0.999)];
    var width = (hi - lo) / bins || 1;
    var counts = new Array(bins).fill(0);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] > hi) break;
      counts[Math.min(bins - 1, Math.floor((arr[i] - lo) / width))]++;
    }
    var labels = counts.map(function (_, b) { return format(lo + width * (b + 0.5)); });
    var pct = counts.map(function (c) { return (c / arr.length) * 100; });

    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id).getContext('2d'), {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: label, data: pct, backgroundColor: 'rgba(56, 178, 172, 0.75)', barPercentage: 1, categoryPercentage: 1 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return c.parsed.y.toFixed(2) + '%'; } } }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 6, color: '#aaa' }, grid: { display: false } },
          y: { ticks: { color: '#aaa', callback: function (v) { return v + '%'; } }, grid: { color: 'rgba(255, 255, 255, 0.08)' } }
        }
      }
    });
  }

  // 상위 N% ⇄ 값 변환
  document.querySelectorAll('.calc-percentile').forEach(function (box) {
    var pctInput = box.querySelector('.pct');
    var valInput = box.querySelector('.val');
    pctInput.addEventListener('input', function () {
      var arr = sorted[box.dataset.metric];
      var p = num(pctInput.value);
      if (arr && p > 0 && p <= 100) valInput.value = Math.round(percentileValue(arr, p));
    });
    valInput.addEventListener('input', function () {
      var arr = sorted[box.dataset.metric];
      if (arr && valInput.value !== '') pctInput.value = percentOf(arr, num(valInput.value)).toFixed(2);
    });
  });
})();
