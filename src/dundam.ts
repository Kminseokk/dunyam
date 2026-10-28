// 던담 정보 갱신 (사용 중지). characters.dundam 컬럼은 migrations/0006 에서 삭제됨.
// 다시 쓰려면 컬럼을 추가하고 주석을 풀고, src/index.ts 의 import·/api/dundam 과
// public/properties.html 의 '던담 업데이트' 버튼 주석도 함께 푼다.
//
// // dundam.xyz 캐릭터 페이지가 내부적으로 호출하는 JSON 엔드포인트를 사용 (기존 Selenium 크롤링 대체)
// interface DundamData {
//   buffCal?: { buffScore?: string }[];
//   damageList?: { vsRanking?: { name: string; dam: string }[] };
// }
//
// const toNumber = (s: string) => Number(s.replace(/,/g, ''));
//
// export async function getDundamValue(serverId: string, characterId: string): Promise<string | null> {
//   const url = new URL('https://dundam.xyz/dat/viewData.jsp');
//   url.searchParams.set('image', characterId);
//   url.searchParams.set('server', serverId);
//   const res = await fetch(url, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; dfadv)' },
//     body: '{}',
//   });
//   if (!res.ok) throw new Error(`dundam -> ${res.status}`);
//   const data = JSON.parse((await res.text()).trim()) as DundamData;
//
//   // 버퍼: 버프 점수 (만 단위)
//   const buffScore = data.buffCal?.find((b) => b.buffScore)?.buffScore;
//   if (buffScore) return `${Math.trunc(toNumber(buffScore) / 1e4)}만`;
//
//   // 딜러: 랭킹 딜량 총합 (억 단위)
//   const total = data.damageList?.vsRanking?.find((d) => d.name === '총 합')?.dam;
//   if (total) return `${Math.trunc(toNumber(total) / 1e8)}억`;
//
//   return null;
// }

export {};
