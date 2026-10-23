(function () {
  'use strict';

  function fmt(n) { return n == null ? '-' : Number(n).toLocaleString(); }

  // 탭별 표시 방식: title(제목), unit(값 단위), column(표 값 열 이름), note(기준 설명)
  var TABS = {
    'fame-sum': { title: '명성 총합 1위 모험단', unit: '', column: '명성 총합', note: '모험단 캐릭터 명성의 합계' },
    'fame-avg': {
      title: '명성 평균 1위 모험단', unit: '', column: '평균 명성',
      note: function (d) { return d.minCharacters + '캐릭터 이상 모험단의 평균 명성'; }
    },
    count: { title: '최다 등록 모험단', unit: '캐릭터', column: '등록 캐릭터', note: 'DUNYAM에 등록된 캐릭터 수' },
    mikaela: { title: '미카엘라 하드 최다 클리어 모험단', unit: '회', column: '클리어 수', note: '모험단 캐릭터의 미카엘라 하드 클리어 합계 (최근 90일)' }
  };

  var chart = null;
  var tabs = document.querySelectorAll('.stats-tabs a');

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function adventureLink(name) {
    var a = el('a', name, 'rank-link');
    a.href = '/properties?search=' + encodeURIComponent(name);
    return a;
  }

  function renderTable(tab, rows) {
    if (!rows.length) return el('p', '아직 랭킹에 오른 모험단이 없습니다.', 'stats-empty');

    var wrap = el('div', null, 'stats-table-wrap');
    var table = el('table', null, 'rank-table');
    var thead = el('thead');
    var head = el('tr');
    ['순위', '모험단', tab.column, '등록 캐릭터', '최고 명성 캐릭터'].forEach(function (h) { head.append(el('th', h)); });
    thead.append(head);
    table.append(thead);

    var tbody = el('tbody');
    rows.forEach(function (r, i) {
      var tr = el('tr');
      var name = el('td');
      name.append(adventureLink(r.adventure_name));
      tr.append(el('td', i + 1), name, el('td', fmt(r.value) + tab.unit), el('td', fmt(r.count)), el('td', r.top_character));
      tbody.append(tr);
    });
    table.append(tbody);
    wrap.append(table);
    return wrap;
  }

  function renderChart(tab, rows) {
    var top = rows.slice(0, 10);
    if (chart) chart.destroy();
    chart = new Chart(document.getElementById('statsChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: top.map(function (r) { return r.adventure_name; }),
        datasets: [{ label: tab.column, data: top.map(function (r) { return r.value; }), backgroundColor: 'rgba(56, 178, 172, 0.75)', borderRadius: 4, maxBarThickness: 40 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#aaa' }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: '#aaa', precision: 0 }, grid: { color: 'rgba(255, 255, 255, 0.08)' } }
        }
      }
    });
  }

  async function show(type) {
    var tab = TABS[type];
    tabs.forEach(function (a) { a.classList.toggle('active', a.dataset.tab === type); });
    document.title = tab.title + ' - 던전앤파이터 모험단 검색 사이트';
    document.getElementById('statsTitle').textContent = tab.title;
    document.getElementById('statsSub').textContent = '불러오는 중...';

    var valueEl = document.getElementById('statsValue');
    var unitEl = document.getElementById('statsUnit');
    var tables = document.getElementById('statsTables');
    try {
      var res = await fetch('/api/ranking?type=' + type);
      var data = await res.json();
      if (!data.ok) throw new Error(data.message);

      var first = data.rows[0];
      var note = typeof tab.note === 'function' ? tab.note(data) : tab.note;
      valueEl.replaceChildren(first ? adventureLink(first.adventure_name) : '-');
      unitEl.textContent = first ? fmt(first.value) + tab.unit : '';
      document.getElementById('statsSub').textContent = note;
      renderChart(tab, data.rows);
      tables.replaceChildren(renderTable(tab, data.rows));
    } catch (e) {
      console.error(e);
      document.getElementById('statsSub').textContent = '랭킹을 불러오지 못했습니다.';
    }
  }

  // 탭 이동은 새로고침 없이 주소만 바꿔서 처리
  tabs.forEach(function (a) {
    a.addEventListener('click', function (event) {
      event.preventDefault();
      history.pushState(null, '', a.getAttribute('href'));
      show(a.dataset.tab);
    });
  });
  window.addEventListener('popstate', function () { show(current()); });

  function current() {
    var type = location.pathname.split('/')[2];
    return TABS[type] ? type : 'fame-sum';
  }

  show(current());
})();
