// 상단 헤더. 메뉴를 추가하려면 MENU에 항목만 추가하면 모든 페이지에 반영된다.
//   label: 표시 이름, href: 이동 주소
//   match: (선택) 이 메뉴를 '현재 메뉴'로 표시할 추가 경로 (href 아래 하위 경로는 자동으로 포함)
//   badge: (선택) 메뉴 옆 작은 표시 (예: 'N', 'beta')
var MENU = [
  { label: '홈', href: '/', match: ['/index', '/properties'] },
  { label: '랭킹', href: '/rank' },
  { label: '통계', href: '/statistics' },
  { label: '강화 기댓값 계산기', href: '/calculator/enhance', match: ['/calculator/safe'], badge: 'N' },
  { label: '증폭 기댓값 계산기', href: '/calculator/amplify', match: ['/calculator/safe-amplify'], badge: 'N' },
  { label: '스펙체크', href: '/spec' },
  { label: '강화/증폭 기록', href: '/record' },
  { label: '스케줄러', href: '/scheduler' },
  { label: '길드', href: '/guild', badge: 'test' },
  //{ label: '안내 사항', href: '/about' }
];

(function () {
  'use strict';

  var header = document.getElementById('site-header');
  var path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';

  var items = MENU.map(function (item) {
    var active = [item.href].concat(item.match || []).indexOf(path) >= 0 ||
      (item.href !== '/' && path.indexOf(item.href + '/') === 0);
    var badge = item.badge ? '<span class="dy-badge">' + item.badge + '</span>' : '';
    return '<li><a href="' + item.href + '"' + (active ? ' class="active" aria-current="page"' : '') + '>' +
      item.label + badge + '</a></li>';
  }).join('');

  header.innerHTML =
    '<div class="dy-header-top"><div class="dy-container">' +
      '<a href="/" class="dy-logo">DUNYAM<span>.xyz</span></a>' +
    '</div></div>' +
    '<nav class="dy-header-menu" aria-label="주 메뉴"><div class="dy-container"><ul>' + items + '</ul></div></nav>';
})();
