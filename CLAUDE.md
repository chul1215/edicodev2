# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

선메디컬센터(대전선병원 vs 유성선병원) EDICODE 기준 객단가 비교 분석 대시보드.
외부 서버 없이 **단일 HTML 파일**(`edicode_v2.html`)을 로컬 브라우저에서 직접 실행하는 구조.

- **배포 URL**: https://chul1215.github.io/edicodev2/
- **메인 파일**: `edicode_v2.html` (약 1,700줄, CSS + HTML + JS 전부 포함)
- **원본 파일**: `edicode0211.html` (수정 금지, 레퍼런스용)

## 파일 구조

```
edicode_v2.html       # 메인 대시보드 (유일한 배포 대상)
edicode0211.html      # 원본 (변경 금지)
index.html            # GitHub Pages 진입점 → edicode_v2.html 리다이렉트
back/                 # 배경 이미지 (Tela de Bloqueio.jpeg)
extract_sample.mjs    # Node.js 샘플 추출 스크립트 (로컬 전용)
UPGRADE_GUIDE.md      # v2 업그레이드 설계 문서
import/               # 원본 CSV 데이터 (gitignore, 로컬 전용)
sample_export/        # 스크립트 출력 결과 (gitignore, 로컬 전용)
```

## 샘플 데이터 추출 (로컬 전용)

`import/` 폴더에 CP949 인코딩 CSV를 넣은 뒤 실행:

```bash
npm install          # iconv-lite 설치 (최초 1회)
node extract_sample.mjs
# → sample_export/ 에 진료과별 MD/XLSX 파일 생성
```

- 파일명에 `대전` / `유성` 포함 여부로 병원 구분
- macOS NFD 파일명 대응: `f.normalize('NFC').includes('대전')`

## edicode_v2.html 내부 구조

파일은 **CSS → HTML → JavaScript** 순으로 단일 파일에 인라인 구성됨.

### CSS 구역 (line ~8–730)
- `:root` / `[data-theme="dark"]` CSS 변수 체계로 라이트/다크 모드 분리
- 하드코딩 색상 없음 — 모든 색상은 `var(--glass)`, `var(--blue)` 등 변수 사용
- 반응형 브레이크포인트: `768px` (iPad), `480px` (모바일), `860px` (기존), `1320px` (Drawer)

### HTML 구역 (line ~730–840)
4개 카드 + 우측 Drawer:
1. 파일 업로드 카드 (`#yFiles`, `#dFiles`, `#runBtn`)
2. QC 체크 카드 (`#qcGrid`)
3. 병원별 요약 카드 (`#kpiRow`)
4. 진료과 비교 테이블 (`#tableWrap`)
5. Drawer (`#drawer`, `#drawerBody`) — 진료과 클릭 시 슬라이드인

### JavaScript 구역 (line ~840–끝)

**전역 상태**
```js
window.__DAE__   // 대전 집계 결과 (newAgg 객체)
window.__YUS__   // 유성 집계 결과
window.__ROWS__  // buildCompare() 결과 (비교 테이블 행 배열)
state            // { metric, q, sort, asc }
```

**핵심 함수 흐름**
```
[분석 실행 클릭]
  └─ parseFileStreaming(file, agg, enc)   // 4MB 청크 스트리밍 파싱
       └─ buildIndexWithAliases(header)  // 컬럼명 유연 매칭
       └─ payGroup / normDept / normEdi  // 규칙 적용
  └─ buildCompare(dae, yus)              // 비교 테이블 데이터 생성
  └─ renderTable / renderKpiRow          // UI 갱신

[진료과 행 클릭]
  └─ renderDrawer(row, dae, yus)
       └─ makeExclusiveListRows(mainAgg, otherAgg, dept)  // 전용 EDI 추출
       └─ renderEdiList(el, rows, mainAgg, otherAgg)      // 카드 렌더링
```

**데이터 규칙 (변경 금지)**
- 급여구분: `1`=급여, `2/3/5`=비급여, `4` 무시
- 제외: `ROOM_RE` (병실료 패턴), `NURSE_RE` (간호관리료 패턴)
- `OB` 진료과 → `GY` 통일
- `SSSSSS` 코드 / Deep CAKS 관련 → `DEEP_CAKS_UNIFIED` 통합

**Export 함수**
- `exportMD(hospName, otherHospName, dept, rows, mainAgg, otherAgg)` → `.md` 다운로드
- `exportXLSX(hospName, dept, rows, mainAgg)` → `.xlsx` 다운로드 (SheetJS CDN)
- 파일명 형식: `대전선병원_JC_전용EDI_20260324.xlsx`

## 수정 시 주의사항

- **집계 로직 변경 금지**: `parseFileStreaming`, `newAgg`, `buildCompare`, `makeExclusiveListRows` 및 규칙 상수(`ROOM_RE`, `NURSE_RE` 등)
- **전역 변수 유지**: `window.__DAE__`, `window.__YUS__`, `window.__ROWS__`
- CSS 수정 시 반드시 `:root`와 `[data-theme="dark"]` 양쪽 모두 확인
- `edicode_v2.html`만 수정; `edicode0211.html`은 원본 보존

## 배포

```bash
git add edicode_v2.html [기타 파일]
git commit -m "..."
git push origin main
# GitHub Pages 자동 반영 (수십 초 소요)
```

`import/`, `node_modules/`, `sample_export/` 는 `.gitignore` 처리됨 — 절대 커밋하지 않을 것.
