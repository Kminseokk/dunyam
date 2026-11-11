// 강화·증폭 기댓값 공통 (기댓값 계산기 · 강화/증폭 기록 손익)
window.DyUpgrade = (function () {
  'use strict';

  // /api/cost 의 단계 목록 → 계산용 배열 (인덱스 = 목표 수치)
  //   drop: 하락 단계 수 / -1 = 파괴 / Infinity = 0으로 초기화 / 0 = 유지, bonus = 실패 시 누적 확률
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

  // t 단계 시도에 실패한 뒤의 수치. 파괴되면 새 장비로 floor(기본 0)부터 다시 시작
  function levelAfterFail(steps, t, floor) {
    var drop = steps.drop[t];
    if (drop === -1) return floor || 0;
    if (drop === Infinity) return 0;
    return drop ? Math.max(0, t - 1 - drop) : t - 1;
  }

  // ─── 평균: 확률식으로 정확히 계산 ───
  // 단계 t 를 "통과"(t-1 → t)하는 데 드는 기댓값 D[t] 를 아래 단계부터 차례로 구한다.
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

  var KEYS = ['gold', 'material', 'attempts', 'destroys'];

  // 단계별 D[t] (t = 1 … target)
  function stepCosts(steps, target, destroyCost, floor) {
    var D = [];
    for (var t = 1; t <= target; t++) {
      var destroy = steps.drop[t] === -1;
      // 새 장비로 다시 시작하면 보정치도 사라진다
      var tries = expectedTries(steps.rate[t], destroy ? 0 : steps.bonus[t]);
      var after = levelAfterFail(steps, t, floor);
      var cost = { gold: steps.gold[t], material: steps.material[t], attempts: 1, destroys: 0 };
      var extra = destroy ? { gold: destroyCost, destroys: 1 } : {};
      D[t] = {};
      KEYS.forEach(function (key) {
        var climb = 0;
        for (var s = after + 1; s < t; s++) climb += D[s][key];
        D[t][key] = tries * cost[key] + (tries - 1) * (climb + (extra[key] || 0));
      });
    }
    return D;
  }

  function exactExpectation(steps, lv, destroyCost, floor) {
    var D = stepCosts(steps, lv.target, destroyCost, floor);
    var result = {};
    KEYS.forEach(function (key) {
      result[key] = 0;
      for (var t = lv.current + 1; t <= lv.target; t++) result[key] += D[t][key];
    });
    return result;
  }

  // 골드는 조/억/만 단위로 표시 (가장 큰 두 단위까지). 음수는 앞에 '-'
  function fmtGold(n) {
    n = Math.round(n);
    if (n < 0) return '-' + fmtGold(-n);
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

  return {
    toArrays: toArrays,
    levelAfterFail: levelAfterFail,
    stepCosts: stepCosts,
    exactExpectation: exactExpectation,
    fmtGold: fmtGold
  };
})();
