# edicode0211.html → edicode_v2.html 업그레이드 지침

> 작성일: 2026-03-24
> 기준 파일: `edicode0211.html` (1,380줄 단일 HTML)
> 결과물 파일: `edicode_v2.html`

---

## 1. 타이틀 / 브랜딩 변경

| 항목 | 기존 | 변경 |
|------|------|------|
| `<title>` | 대전선병원 vs 유성선병원 \| 객단가 비교 보드 (업로드형) | 선메디컬센터 객단가 비교 분석 프로그램 2.0ver |
| `<h1>` | 대전선병원 vs 유성선병원 \| 객단가 비교 보드 (업로드형) | 선메디컬센터 객단가 비교 분석 프로그램 |
| `.sub` 부제 | EDICODE 기준 · 환자 1명 단위 · ... | Sun Medical Center \| EDICODE 기준 · 환자 1명 단위 · 급여=1 / 비급여=2,3,5 (4 무시) · 병실료/간호관리료 제외 |
| 버전 뱃지 | 없음 | 헤더 우측 `v2.0` 뱃지 추가 |

---

## 2. 핵심 기능 유지

아래 기능은 **변경 없이 그대로** 유지:

- CSV 다중 업로드 (유성 / 대전 각각)
- 인코딩 선택 (CP949 / UTF-8)
- 4MB 스트리밍 파싱 (`parseFileStreaming`)
- 집계 로직 전체 (`newAgg`, `buildCompare`, `makeExclusiveListRows` 등)
- 급여/비급여/제외 규칙 (ROOM_RE, NURSE_RE, OB→GY, DEEP_CAKS_UNIFIED)
- QC 체크 카드 (카드 2)
- 병원별 요약 카드 (카드 3)
- 진료과 비교 보드 테이블 + 정렬 (카드 4)
- 우측 Drawer 상세 (전용 EDI TOP30)
- 총액 / 급여 / 비급여 세그먼트 토글
- 진료과 검색

---

## 3. 글래스모피즘(Glassmorphism) 디자인 + 라이트/다크 모드

### 3-1. 전체 방향

- **배경**: 그라디언트 메시 배경 (라이트: 파스텔 블루-퍼플 / 다크: 딥 네이비-퍼플)
- **카드/패널**: `backdrop-filter: blur(16px)` + `background: rgba(...)` 반투명 유리 효과
- **테두리**: `border: 1px solid rgba(255,255,255,0.2)` (라이트) / `rgba(255,255,255,0.08)` (다크)
- **그림자**: `box-shadow: 0 8px 32px rgba(0,0,0,0.12)` 부드러운 그림자

### 3-2. CSS 변수 체계 (`:root` / `[data-theme="dark"]`)

```css
/* Light (기본) */
:root {
  --bg-from: #e8eaf6;
  --bg-to: #f3e5f5;
  --glass: rgba(255, 255, 255, 0.55);
  --glass-border: rgba(255, 255, 255, 0.35);
  --glass-shadow: 0 8px 32px rgba(100, 80, 200, 0.10);
  --text: #1a1a2e;
  --muted: #6b7280;
  --line: rgba(200, 200, 220, 0.4);
  --blue: #4f46e5;
  --blue2: rgba(79, 70, 229, 0.10);
  --green: #059669;
  --red: #dc2626;
  --header-glass: rgba(255,255,255,0.72);
}

/* Dark */
[data-theme="dark"] {
  --bg-from: #0f0c29;
  --bg-to: #302b63;
  --glass: rgba(255, 255, 255, 0.06);
  --glass-border: rgba(255, 255, 255, 0.10);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.40);
  --text: #f1f5f9;
  --muted: #94a3b8;
  --line: rgba(255, 255, 255, 0.08);
  --blue: #818cf8;
  --blue2: rgba(129, 140, 248, 0.15);
  --green: #34d399;
  --red: #f87171;
  --header-glass: rgba(15, 12, 41, 0.82);
}
```

### 3-3. 배경 처리

```css
body {
  background: linear-gradient(135deg, var(--bg-from) 0%, var(--bg-to) 100%);
  background-attachment: fixed;
  min-height: 100vh;
}
```

### 3-4. 라이트/다크 토글 버튼

- 위치: 상단 헤더 우측 끝 (버전 뱃지 옆)
- 아이콘: ☀️ / 🌙 텍스트 또는 SVG 아이콘
- 동작: `document.documentElement.setAttribute('data-theme', ...)` + `localStorage` 저장
- 초기 로드 시 `localStorage` 또는 `prefers-color-scheme` 자동 감지

### 3-5. 변경되는 컴포넌트 스타일

| 컴포넌트 | 변경 내용 |
|---------|---------|
| `.top` (헤더) | `background: var(--header-glass)` + blur |
| `.card` | `background: var(--glass)`, `border: 1px solid var(--glass-border)`, blur |
| `.box` | 동일 glass 처리 |
| `.kpi` | 동일 glass 처리 |
| `.drawer` | glass 패널 |
| `.btn` | glass 버튼 스타일 |
| `.seg` | glass segmented control |
| `.table-wrap` | glass 테이블 |
| `thead th` | 반투명 sticky 헤더 |

---

## 4. 출력 기능 추가 (MD / CSV Export)

### 4-1. 개요

진료과 비교 보드 테이블에서 각 진료과 행에 **출력 버튼**을 추가.
또는 Drawer(상세 화면) 내부에 출력 버튼 배치 (UX 논의 필요 → 드로어 내부로 결정).

### 4-2. 출력 트리거 위치

**Drawer 헤더 영역** (기존 `닫기` 버튼 옆):

```
[진료과: JC]  JC 진료과 상세              [📥 대전 MD] [📥 대전 CSV] [📥 유성 MD] [📥 유성 CSV]  [닫기]
```

또는 Drawer 내 전용 EDI 섹션 헤더별 버튼:

```
대전 전용 EDI (유성 동일 진료과 미발생)    [MD 저장] [CSV 저장]
유성 전용 EDI (대전 동일 진료과 미발생)    [MD 저장] [CSV 저장]
```

→ **결정: 전용 EDI 섹션 헤더별 버튼 방식** (더 직관적)

### 4-3. 출력 파일명 규칙

```
대전선병원_{진료과코드}_전용EDI_{날짜}.md
대전선병원_{진료과코드}_전용EDI_{날짜}.csv
유성선병원_{진료과코드}_전용EDI_{날짜}.md
유성선병원_{진료과코드}_전용EDI_{날짜}.csv

예) 대전선병원_JC_전용EDI_20260324.md
```

### 4-4. MD 출력 포맷

```markdown
# 대전선병원 - JC 진료과 전용 EDI 목록
> 생성일: 2026-03-24 | 기준: 총액(제외 후) | 병실료/간호관리료 제외

## 분석 요약
- 진료과: JC
- 대전 환자수: 1,234명
- 유성 환자수: 987명
- 대전 객단가: 123,456원
- 유성 객단가: 98,765원
- 객단가 차이(대전-유성): +24,691원

## 대전 전용 EDI (유성 동일 진료과 미발생, 금액순 TOP30)

| 순위 | EDI코드 | 수가명 | 총금액 | 발생수(환자기준) | 환자당평균 | 1회단가 | 타과존재 |
|------|---------|--------|--------|----------------|-----------|---------|---------|
| 1 | AA123 | 수가명칭 | 1,234,567원 | 456건 | 2,707원 | 1,234원 | - |
| 2 | ... | ... | ... | ... | ... | ... | O |
...
```

### 4-5. CSV 출력 포맷 (UTF-8 BOM 포함, Excel 호환)

```
병원,진료과,EDI코드,수가명,총금액,발생수(환자기준),환자당평균,1회단가,타과존재여부
대전선병원,JC,AA123,수가명칭,1234567,456,2707,1234,N
...
```

### 4-6. 구현 방법

```javascript
// MD 생성 함수
function generateMD(hospName, dept, rows, mainAgg, otherAgg, metric, deptStats) { ... }

// CSV 생성 함수
function generateCSV(hospName, dept, rows, mainAgg, otherAgg, metric) { ... }

// 파일 다운로드 공통 함수
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
```

---

## 5. MCP 활용 계획

| 작업 | MCP |
|------|-----|
| 글래스모피즘 CSS 최신 패턴 참조 | `mcp__context7__query-docs` (MDN / CSS 레퍼런스) |
| 구현 중 브라우저 렌더링 확인 | `mcp__playwright__playwright_navigate` + `playwright_screenshot` |
| 컬러 팔레트 / 디자인 참고 | `mcp__firecrawl__firecrawl_scrape` (디자인 레퍼런스 스크래핑) |

---

## 6. 작업 순서 (Phase)

### Phase 1 — 타이틀 + CSS 변수 + 다크모드 토글
1. `<title>`, `<h1>`, `.sub` 텍스트 변경
2. CSS 변수 재설계 (light/dark 분리)
3. 배경 그라디언트 적용
4. 다크모드 토글 버튼 + localStorage 저장 로직

### Phase 2 — 글래스모피즘 컴포넌트 스타일
1. `.card`, `.box`, `.kpi` glass 처리
2. `.top` (헤더) glass 처리
3. `.drawer` glass 패널
4. 버튼, 뱃지, 칩 스타일 업데이트
5. 테이블 스타일 업데이트

### Phase 3 — Export 기능 구현
1. `generateMD()`, `generateCSV()`, `downloadFile()` 함수 작성
2. Drawer 전용 EDI 섹션 헤더에 버튼 추가
3. 버튼 클릭 이벤트 연결
4. 파일명 자동 생성 로직

### Phase 4 — QA / 마무리
1. Playwright로 라이트/다크 렌더링 스크린샷 확인
2. 기존 분석 기능 동작 검증 (파싱, 집계, 테이블, 드로어)
3. 반응형(모바일) 확인

---

## 7. 주의 사항

- 기존 **집계 로직은 변경 금지** (파싱, 규칙, 집계 함수 모두)
- `window.__DAE__`, `window.__YUS__`, `window.__ROWS__` 전역 변수 유지
- CSV 출력 시 **UTF-8 BOM** (`\uFEFF`) 포함 → Excel 한글 깨짐 방지
- MD 출력 수가명에 파이프(`|`) 문자 있을 경우 이스케이프 처리 (`\|`)
- 다크모드 전환 시 열린 Drawer 스타일도 즉시 반영

---

## 8. 미결정 사항 (확인 필요)

- [ ] 출력 버튼 위치: **섹션 헤더별** vs **드로어 헤더 통합** 중 최종 선택
- [ ] MD 출력 범위: TOP30 고정 vs 전체 출력 선택 가능
- [ ] 버전 뱃지 위치 및 디자인
- [ ] 글래스모피즘 강도 (blur 값: 12px / 16px / 24px)
