(function () {
  'use strict';

  var SERVERS = {
    cain: '카인', diregie: '디레지에', siroco: '시로코', prey: '프레이',
    casillas: '카시야스', hilder: '힐더', anton: '안톤', bakal: '바칼'
  };
  var COLUMNS = [
    'job_name', 'job_grow_name', 'item_level_sum', 'fame', 'dundam', 'mist_gear_count',
    'custom_epic_count', 'enchant', 'queen_creature', 'fashionista_aurora', 'title', 'dark_land_count'
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

    $('fame_sum').innerText = fmt(data.fameSum);
    $('fame_avg').innerText = fmt(data.fameAvg);
    $('dark_land_sum').innerText = fmt(data.darkLandSum);
    $('mistGear_sum').innerText = fmt(data.mistGearSum);

    var tbody = $('characterRows');
    tbody.replaceChildren();
    characters.forEach(function (c) {
      var color = c.dundam.indexOf('억') >= 0 ? 'row-dealer' : c.dundam.indexOf('만') >= 0 ? 'row-buffer' : '';
      var tr = document.createElement('tr');

      var server = cell('td');
      server.replaceChildren(cell('h6', SERVERS[c.server_id] || c.server_id, 'mb-0 text-sm px-3 py-1 ' + color));
      var name = cell('td');
      name.replaceChildren(cell('h6', c.character_name, 'mb-0 text-sm ' + color));
      tr.append(server, name);

      COLUMNS.forEach(function (key) {
        var td = cell('td', null, 'align-middle text-center text-sm');
        td.replaceChildren(cell('span', key === 'fame' ? fmt(c[key]) : c[key], 'text-xs font-weight-bold ' + color));
        tr.append(td);
      });
      tbody.append(tr);
    });
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
    return { server: form.elements.server.value, name: form.elements.name.value };
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

  // 차트 (임시 데이터, 추후 업데이트 예정)
  var tickFont = { size: 14, weight: 300, family: 'Roboto', style: 'normal', lineHeight: 2 };
  var grid = { drawBorder: false, display: true, drawOnChartArea: true, drawTicks: false, borderDash: [5, 5], color: 'rgba(255, 255, 255, .2)' };

  function chart(id, type, labels, dataset, yOptions, xGrid) {
    new Chart($(id).getContext('2d'), {
      type: type,
      data: { labels: labels, datasets: [dataset] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        interaction: { intersect: false, mode: 'index' },
        scales: {
          y: Object.assign({ grid: grid, ticks: { display: true, color: '#f8f9fa', padding: 10, font: tickFont } }, yOptions),
          x: { grid: xGrid, ticks: { display: true, color: '#f8f9fa', padding: 10, font: tickFont } }
        }
      }
    });
  }

  var barDataset = {
    label: '총합 명성', tension: 0.4, borderWidth: 0, borderRadius: 4, borderSkipped: false,
    backgroundColor: 'rgba(255, 255, 255, .8)', data: [50300, 50500, 51000, 51500, 52000, 52000], maxBarThickness: 6
  };
  var barLabels = ['임시1', '임시2', '임시3', '임시4', '임시5', '임시6'];
  var barY = { beginAtZero: false, suggestedMin: 50000, suggestedMax: 53000 };

  chart('chart-Variance-fame', 'line', ['12/21', '12/28', '1/4', '1/11', '1/18', '1/25'], {
    label: '변동 명성', tension: 0, borderWidth: 4, pointRadius: 5,
    pointBackgroundColor: 'rgba(255, 255, 255, .8)', pointBorderColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, .8)', backgroundColor: 'transparent', fill: true,
    data: [50500, 51000, 51500, 52000, 52000, 52000], maxBarThickness: 6
  }, {}, { drawBorder: false, display: false, drawOnChartArea: false, drawTicks: false, borderDash: [5, 5] });
  chart('chart-adv-total', 'bar', barLabels, barDataset, barY, grid);
  chart('chart-adv-mean', 'bar', barLabels, Object.assign({}, barDataset), barY, grid);

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
