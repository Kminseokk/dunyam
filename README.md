# 던파 모험단 검색 사이트

Cloudflare Workers(무료 티어) 기반.

- `public/` : 정적 페이지/에셋 (Workers Static Assets)
- `src/` : API Worker (Neople OpenAPI, 던담 조회)
- `migrations/` : D1(SQLite) 스키마

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/adventure?name=` | 모험단 캐릭터 목록과 집계 |
| POST | `/api/check` | `{adventure, server, name}` 모험단 소속 확인 |
| POST | `/api/save` | `{adventure, server, name}` 캐릭터 추가 |
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
