# 변경 기록

이 프로젝트의 주요 변경 사항을 날짜별로 기록한다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따르고, 실서버 배포 시점마다 날짜 태그(`YYYY-MM-DD`)를 붙인다.
같은 날 여러 번 배포하면 `YYYY-MM-DD.2`처럼 번호를 붙인다.

## [Unreleased]

## [2026-10-23]

### Added
- 랭킹 페이지 `/rank/*`: 명성 총합 · 명성 평균(8캐릭터 이상) · 최다 등록 · 미카엘라 하드, 상위 10위
- 통계 페이지 `/statistics/*`: 서버 · 직업 · 명성 분포 · 던담
- 메인 화면 명예의 전당 카드 6개: 최고 명성 캐릭터, 명성 총합 1위, 명성 평균 1위, 미카엘라 하드 최다 클리어 모험단, 최고 버퍼, 최다 등록 모험단
- 헤더 메뉴: 기댓값 계산기(N), 강화, 증폭, 길드(test). 모두 준비 중 페이지로 연결
- 미카엘라 하드 클리어 수(최근 90일, 선발대 포함) 집계
- 명성 50,000 미만 캐릭터는 신규 등록 불가 (`src/rules.ts`의 `MIN_FAME`)
- 모험단 요약 테이블 `adventures`와 랭킹용 인덱스 (마이그레이션 `0004`)
- 집계 API 엣지 캐시: 명예의 전당·랭킹 5분(캐릭터 변경 시 즉시 삭제), 통계 1시간

### Changed
- 상단 헤더를 2줄 구조(로고 / 메뉴)로 개편. 메뉴는 `public/js/header.js`의 `MENU` 한 곳에서 관리
- 하단 영역을 검은 배경 + 흰 글씨로 변경
- 메인 배경 사진 영역을 절반 높이로 축소
- 헤더 '분포 그래프' → '통계', `/data` → `/statistics/server` 리다이렉트
- 어둑섬 클리어 수 → 미카엘라 하드 클리어 수 (마이그레이션 `0002`)
- 캐릭터 검색 시 서버 선택 제거: 등록된 캐릭터의 서버를 먼저 찾고, 없을 때만 전 서버 검색
- 랭킹·명예의 전당이 캐릭터 전체 대신 모험단 요약 테이블을 읽도록 변경 (무료 플랜 D1 읽기 한도 대응)

### Removed
- 모험단 페이지의 임시 그래프 3개
- 미스트기어 수 · 커스텀 에픽 수 (화면, 수집 로직, DB 컬럼. 마이그레이션 `0003`)

### Fixed
- 브라우저로 `/rank`, `/data` 등에 들어가면 404 페이지가 뜨던 문제 (`wrangler.jsonc`의 `assets.run_worker_first`)
- 엣지 캐시 적중 응답에 도메인 기본 브라우저 캐시(4시간)가 적용되던 문제

## [2026-10-17]

### Added
- Cloudflare 무료 플랜 기반으로 재구축: Workers(API) + Static Assets(페이지·이미지) + D1(DB)
- 커스텀 도메인 `dunyam.xyz`, `www.dunyam.xyz` 연결
- 새 저장소 `Kminseokk/dunyam`로 이전 (이전 저장소 `Kminseokk/dfadv`)

### Changed
- Flask + MySQL → Cloudflare Workers + D1
- 모험단마다 테이블을 만들던 구조 → 단일 `characters` 테이블
- 던담 수치: Selenium 크롤링 → 던담 JSON 엔드포인트 직접 호출
- Neople API 키를 코드에서 Worker secret(`NEOPLE_API_KEY`)으로 이동
- 대표 캐릭터 이미지를 Neople이 주는 jobId / jobGrowId로 선택
- 일반 업데이트 시 던담 수치가 초기화되지 않도록 변경
- 사이트 이름 DUNFA.XYZ → DUNYAM.XYZ

### Removed
- 사용하지 않는 코드와 에셋 (rank/data 템플릿, 템플릿 데모 이미지·아이콘 폰트·SCSS, 쓰지 않는 JS 라이브러리 등)

### Fixed
- 모험단 이름을 테이블 이름으로 그대로 쓰던 SQL 인젝션 위험
- 직업군 간 jobGrowId 중복으로 대표 캐릭터 이미지가 잘못 나오던 문제
- 닉네임 확인이 서버를 `prey`로 고정하던 문제
- 칭호·크리쳐가 없는 캐릭터 저장 시 오류

[Unreleased]: https://github.com/Kminseokk/dunyam/compare/2026-10-23...HEAD
[2026-10-23]: https://github.com/Kminseokk/dunyam/compare/2026-10-17...2026-10-23
[2026-10-17]: https://github.com/Kminseokk/dunyam/releases/tag/2026-10-17
