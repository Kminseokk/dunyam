(function () {
  'use strict';

  var SERVERS = {
    cain: '카인', diregie: '디레지에', siroco: '시로코', prey: '프레이',
    casillas: '카시야스', hilder: '힐더', anton: '안톤', bakal: '바칼'
  };

  function fmt(n) { return n == null ? '-' : Number(n).toLocaleString(); }
  function pct(part, total) { return total ? (part / total * 100).toFixed(1) + '%' : '-'; }

  // 탭별 표시 방식
  //   summary: 큰 숫자 / chart: 막대 그래프 / tables: 표 목록
  var TABS = {
    server: {
      title: '서버 통계',
      summary: function (d) {
        return { value: fmt(d.summary.characters), unit: '캐릭터', sub: fmt(d.summary.adventures) + '개 모험단 등록' };
      },
      chart: function (d) {
        return { label: '캐릭터 수', labels: d.rows.map(function (r) { return SERVERS[r.server_id] || r.server_id; }), values: d.rows.map(function (r) { return r.count; }) };
      },
      tables: function (d) {
        var total = d.summary.characters;
        return [{
          head: ['서버', '캐릭터 수', '비율', '평균 명성', '최고 명성'],
          rows: d.rows.map(function (r) {
            return [SERVERS[r.server_id] || r.server_id, fmt(r.count), pct(r.count, total), fmt(r.avg_fame), fmt(r.max_fame)];
          })
        }];
      }
    },
    job: {
      title: '직업 통계',
      summary: function (d) {
        return { value: fmt(d.rows.length), unit: '개 직업', sub: '등록 캐릭터 ' + fmt(d.summary.characters) + '명 기준' };
      },
      chart: function (d) {
        var top = d.rows.slice(0, 20);
        return { label: '캐릭터 수', labels: top.map(function (r) { return r.job_grow_name; }), values: top.map(function (r) { return r.count; }) };
      },
      tables: function (d) {
        var total = d.summary.characters;
        return [{
          head: ['직업', '뿌리 직업', '캐릭터 수', '비율', '평균 명성', '최고 명성'],
          rows: d.rows.map(function (r) {
            return [r.job_grow_name, r.job_name, fmt(r.count), pct(r.count, total), fmt(r.avg_fame), fmt(r.max_fame)];
          })
        }];
      }
    },
    fame: {
      title: '명성 분포',
      summary: function (d) {
        return { value: fmt(d.summary.avg_fame), unit: '평균 명성', sub: '최저 ' + fmt(d.summary.min_fame) + ' · 최고 ' + fmt(d.summary.max_fame) + ' · ' + fmt(d.summary.characters) + '캐릭터' };
      },
      chart: function (d) {
        return { label: '캐릭터 수', labels: d.rows.map(function (r) { return fmt(r.bucket); }), values: d.rows.map(function (r) { return r.count; }) };
      },
      tables: function (d) {
        var total = d.summary.characters;
        return [{
          head: ['명성 구간', '캐릭터 수', '비율'],
          rows: d.rows.slice().reverse().map(function (r) {
            return [fmt(r.bucket) + ' ~ ' + fmt(r.bucket + d.bucketSize - 1), fmt(r.count), pct(r.count, total)];
          })
        }];
      }
    }
  };

  var chart = null;
  var tabs = document.querySelectorAll('.stats-tabs a');

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderTable(table) {
    var frag = document.createDocumentFragment();
    if (table.title) frag.append(el('h2', table.title, 'stats-table-title'));
    if (!table.rows.length) {
      frag.append(el('p', '아직 데이터가 없습니다.', 'stats-empty'));
      return frag;
    }
    var wrap = el('div', null, 'stats-table-wrap');
    var t = el('table');
    var thead = el('thead');
    var tr = el('tr');
    table.head.forEach(function (h) { tr.append(el('th', h)); });
    thead.append(tr);
    t.append(thead);
    var tbody = el('tbody');
    table.rows.forEach(function (row) {
      var r = el('tr');
      row.forEach(function (c) { r.append(el('td', c)); });
      tbody.append(r);
    });
    t.append(tbody);
    wrap.append(t);
    frag.append(wrap);
    return frag;
  }

  function renderChart(c) {
    if (chart) chart.destroy();
    chart = new Chart(document.getElementById('statsChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: c.labels,
        datasets: [{ label: c.label, data: c.values, backgroundColor: 'rgba(56, 178, 172, 0.75)', borderRadius: 4, maxBarThickness: 40 }]
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

    var tables = document.getElementById('statsTables');
    try {
      var res = await fetch('/api/statistics?type=' + type);
      var data = await res.json();
      if (!data.ok) throw new Error(data.message);

      var summary = tab.summary(data);
      document.getElementById('statsValue').textContent = summary.value;
      document.getElementById('statsUnit').textContent = summary.unit;
      document.getElementById('statsSub').textContent = summary.sub;
      renderChart(tab.chart(data));
      tables.replaceChildren.apply(tables, tab.tables(data).map(renderTable));
    } catch (e) {
      console.error(e);
      document.getElementById('statsSub').textContent = '통계를 불러오지 못했습니다.';
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
    return TABS[type] ? type : 'server';
  }

  show(current());
})();
