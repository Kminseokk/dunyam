(function () {
  'use strict';

  var SERVERS = {
    cain: '카인', diregie: '디레지에', siroco: '시로코', prey: '프레이',
    casillas: '카시야스', hilder: '힐더', anton: '안톤', bakal: '바칼'
  };

  function fmt(n) { return Number(n).toLocaleString(); }
  function server(id) { return SERVERS[id] || id; }

  // 카드별 표시 방식: value(큰 글씨), sub(아래 설명)
  var CARDS = {
    topFame: function (r) {
      return { value: fmt(r.fame), sub: r.character_name + ' · ' + server(r.server_id) + ' · ' + r.adventure_name };
    },
    topFameSum: function (r) {
      return { value: r.adventure_name, sub: '명성 합계 ' + fmt(r.value) + ' · ' + r.count + '캐릭터' };
    },
    topFameAvg: function (r) {
      return { value: r.adventure_name, sub: '평균 명성 ' + fmt(r.value) + ' · ' + r.count + '캐릭터' };
    },
    topMikaela: function (r) {
      return { value: r.adventure_name, sub: '합계 ' + fmt(r.value) + '회 · ' + r.count + '캐릭터' };
    },
    topBuffer: function (r) {
      return { value: r.dundam, sub: r.character_name + ' · ' + r.job_grow_name + ' · ' + r.adventure_name };
    },
    topCount: function (r) {
      return { value: r.value + '캐릭터', sub: r.adventure_name };
    }
  };

  function render(data) {
    document.querySelectorAll('.highlight-card').forEach(function (card) {
      var row = data[card.dataset.key];
      var valueEl = card.querySelector('.highlight-value');
      var subEl = card.querySelector('.highlight-sub');

      if (!row) {
        card.classList.add('empty');
        valueEl.textContent = '-';
        subEl.textContent = card.dataset.key === 'topFameAvg' ? '8캐릭터 이상 모험단이 없습니다' : '아직 기록이 없습니다';
        return;
      }
      var view = CARDS[card.dataset.key](row);
      valueEl.textContent = view.value;
      subEl.textContent = view.sub;
      card.href = '/properties?search=' + encodeURIComponent(row.adventure_name);
    });
  }

  fetch('/api/highlights')
    .then(function (res) { return res.json(); })
    .then(render)
    .catch(function (e) {
      console.error(e);
      document.querySelectorAll('.highlight-sub').forEach(function (el) { el.textContent = '불러오지 못했습니다'; });
    });
})();
