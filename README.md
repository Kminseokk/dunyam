# 던파 모험단 검색 사이트 (dunyam.xyz)

Cloudflare Workers(무료 티어) 기반.

- `public/` : 정적 페이지/에셋 (Workers Static Assets)
- `src/` : API Worker (Neople OpenAPI, 던담 조회, 랭킹·통계 집계)
- `migrations/` : D1(SQLite) 스키마

변경 기록은 [CHANGELOG.md](CHANGELOG.md) 참고.

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/adventure?name=` | 모험단 캐릭터 목록과 집계 |
| GET | `/api/highlights` | 메인 화면 명예의 전당 (엣지 캐시 5분) |
| GET | `/api/ranking?type=` | 모험단 랭킹 상위 10위. `fame-sum` / `fame-avg` / `count` / `mikaela` (엣지 캐시 5분) |
| GET | `/api/statistics?type=` | 통계. `server` / `job` / `fame` / `dundam` (엣지 캐시 1시간) |
| GET | `/api/cost?type=` | 기댓값 계산기 단계별 확률·비용 (`src/cost.ts`). `enhance` / `safe` / `amplify` / `safe-amplify` (엣지 캐시 10분) |
| POST | `/api/check` | `{adventure, name}` 모험단 소속·등록 가능 여부 확인 |
| POST | `/api/save` | `{adventure, name}` 캐릭터 추가 |
| POST | `/api/refresh` | `{adventure, uid}` 캐릭터 1명 갱신 |
| POST | `/api/dundam` | `{adventure, uid}` 던담 수치 갱신 |

업데이트는 Workers 무료 플랜의 요청당 외부 호출 제한(50회) 때문에 브라우저가 캐릭터별로 나눠 요청한다.

## 개발 / 배포

```sh
npm install
npx wrangler secret put NEOPLE_API_KEY   # 최초 1회
npm run db:migrate:remote                # 스키마 변경 시
npm run deploy
```

로컬 실행: `.dev.vars`에 `NEOPLE_API_KEY=...` 작성 후 `npm run db:migrate:local && npm run dev`

배포 후에는 [CHANGELOG.md](CHANGELOG.md)에 내용을 적고 배포한 커밋에 날짜 태그를 붙인다.

```sh
git tag -a 2026-10-23 -m "배포 2026-10-23"
git push origin 2026-10-23
```
