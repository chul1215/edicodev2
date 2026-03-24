// extract_sample.mjs
// 실제 CSV를 파싱해 JC, IMC, NR 전용 EDI 샘플 파일 생성

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import iconv from 'iconv-lite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMPORT_DIR = path.join(__dirname, 'import');
const OUT_DIR    = path.join(__dirname, 'sample_export');
fs.mkdirSync(OUT_DIR, { recursive: true });

const TARGET_DEPTS = ['JC', 'IMC', 'NR'];
const TODAY = '20260324';

// ===== Rules (HTML과 동일) =====
const ROOM_RE  = /(병실료|상급병실료|일반병실료|특실|1인실|2인실|3인실|4인실|5인실|6인실|다인실)/i;
const NURSE_RE = /(간호\s*관리\s*료|간호관리료|간호관리료차등|간호관리\s*차등)/i;

function payGroup(flag) {
  const f = (flag || '').trim();
  if (f === '1') return 'pay';
  if (f === '2' || f === '3' || f === '5') return 'non';
  return null;
}
function normDept(d) {
  const s = (d || '').trim() || '미상';
  return s === 'OB' ? 'GY' : s;
}
function normEdi(edi, name) {
  const eu = edi.toUpperCase().replace(/\s+/g, '');
  const nu = name.toUpperCase().replace(/\s+/g, '');
  if (eu === 'SSSSSS' || nu.includes('DEEPCAKS') || nu.includes('심정지발생위험감시') ||
      nu.includes('24시간이내심정지') || (nu.includes('신의료') && nu.includes('심정지'))) {
    return 'DEEP_CAKS_UNIFIED';
  }
  return edi;
}

// ===== CSV 파서 =====
function csvSplit(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function buildIdx(header) {
  const h = header.map(s => s.replace(/^\uFEFF/, '').trim());
  const alias = {
    patient: ['환자번호','환자ID','차트번호','차트No','차트NO','환자No','환자NO'],
    date:    ['진료일','발생일','처방일','오더일'],
    dept:    ['진료과','진료과코드','진료과 코드','진료과명'],
    payflag: ['급여여부','급여구분','급여구분코드','급여/비급여','급비구분'],
    amt:     ['금액','진료비','총진료비','청구금액','발생금액'],
    edi:     ['EDICODE','EDI코드','EDI CODE','EDI'],
    name:    ['수가명','행위명','수가항목명','항목명','처치명'],
  };
  const result = {};
  for (const [key, keys] of Object.entries(alias)) {
    result[key] = keys.reduce((found, k) => found >= 0 ? found : h.indexOf(k), -1);
  }
  return result;
}

// ===== 집계 구조 =====
function newAgg(hosp) {
  return {
    hosp,
    patientsByDept: new Map(),
    sumsByDept: new Map(),
    ediSumByDept: new Map(),
    ediPatientsByDept: new Map(),
    ediOccurByDept: new Map(),
    ediToDepts: new Map(),
    ediMeta: new Map(),
    minDate: null, maxDate: null,
    totalRows: 0, validRows: 0,
  };
}

function parseCSV(filePath, agg) {
  const buf = fs.readFileSync(filePath);
  const text = iconv.decode(buf, 'cp949');
  const lines = text.split(/\r?\n/);

  let idx = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = csvSplit(line);

    if (!idx) {
      idx = buildIdx(cols);
      continue;
    }

    agg.totalRows++;
    const dept    = normDept(cols[idx.dept]);
    const patient = (cols[idx.patient] || '').trim();
    const dateStr = (cols[idx.date] || '').trim();
    const g       = payGroup((cols[idx.payflag] || '').trim());

    if (dateStr) {
      const t = Date.parse(dateStr);
      if (isFinite(t)) {
        if (!agg.minDate || t < agg.minDate) agg.minDate = t;
        if (!agg.maxDate || t > agg.maxDate) agg.maxDate = t;
      }
    }

    if (!g) continue;
    agg.validRows++;

    if (!agg.patientsByDept.has(dept)) agg.patientsByDept.set(dept, new Set());
    if (!agg.sumsByDept.has(dept))     agg.sumsByDept.set(dept, { pay: 0, non: 0 });
    if (!agg.ediSumByDept.has(dept))   agg.ediSumByDept.set(dept, new Map());
    if (!agg.ediPatientsByDept.has(dept)) agg.ediPatientsByDept.set(dept, new Map());
    if (!agg.ediOccurByDept.has(dept)) agg.ediOccurByDept.set(dept, new Map());

    if (patient) agg.patientsByDept.get(dept).add(patient);

    const name = (cols[idx.name] || '').trim();
    const amt  = parseFloat(cols[idx.amt]) || 0;

    if (ROOM_RE.test(name) || NURSE_RE.test(name)) continue;

    const s = agg.sumsByDept.get(dept);
    if (g === 'pay') s.pay += amt; else s.non += amt;

    const edi = normEdi((cols[idx.edi] || '').trim(), name);
    if (!edi || edi.toLowerCase() === 'nan') continue;

    // ediSumByDept
    const em = agg.ediSumByDept.get(dept);
    if (!em.has(edi)) em.set(edi, { pay: 0, non: 0 });
    if (g === 'pay') em.get(edi).pay += amt; else em.get(edi).non += amt;

    // ediPatientsByDept (발생수: 환자×EDI)
    const ep = agg.ediPatientsByDept.get(dept);
    if (!ep.has(edi)) ep.set(edi, new Set());
    if (patient) ep.get(edi).add(patient);

    // ediOccurByDept (시행건수: 라인)
    const eo = agg.ediOccurByDept.get(dept);
    if (!eo.has(edi)) eo.set(edi, { pay: 0, non: 0 });
    if (g === 'pay') eo.get(edi).pay += 1; else eo.get(edi).non += 1;

    // ediToDepts
    if (!agg.ediToDepts.has(edi)) agg.ediToDepts.set(edi, new Set());
    agg.ediToDepts.get(edi).add(dept);

    // ediMeta
    if (!agg.ediMeta.has(edi)) agg.ediMeta.set(edi, { bestName: '', bestAmt: 0 });
    const meta = agg.ediMeta.get(edi);
    if (!meta.bestName || amt > meta.bestAmt) { meta.bestName = name; meta.bestAmt = amt; }
  }
}

// ===== 전용 EDI 추출 (main vs other) =====
function getExclusiveRows(mainAgg, otherAgg, dept, metric) {
  const mainEdi = mainAgg.ediSumByDept.get(dept);
  const otherEdi = otherAgg.ediSumByDept.get(dept);
  if (!mainEdi) return [];

  const rows = [];
  for (const [edi, sums] of mainEdi.entries()) {
    if (otherEdi && otherEdi.has(edi)) continue; // 상대 동일 진료과에 존재 → 제외
    const total = metric === 'pay' ? sums.pay : metric === 'non' ? sums.non : sums.pay + sums.non;
    const occur = mainAgg.ediOccurByDept.get(dept)?.get(edi) || { pay: 0, non: 0 };
    const totalOccur = occur.pay + occur.non;
    const patients = mainAgg.ediPatientsByDept.get(dept)?.get(edi)?.size || 0;
    const perPatient = patients > 0 ? Math.round(total / patients) : 0;
    const perOccur   = totalOccur > 0 ? Math.round(total / totalOccur) : 0;
    const name = mainAgg.ediMeta.get(edi)?.bestName || '';
    // 타과 존재: 상대 병원의 다른 진료과에 있는지 → 해당 진료과 코드 목록
    const otherDepts = otherAgg.ediToDepts.get(edi);
    const crossDepts = otherDepts && otherDepts.size > 0
      ? [...otherDepts].filter(d => d !== dept).sort()
      : [];

    rows.push({ edi, name, total, patients, perPatient, perOccur, crossDepts });
  }
  rows.sort((a, b) => b.total - a.total);
  return rows;
}

function fmtWon(n) { return n.toLocaleString('ko-KR') + '원'; }
function fmtNum(n) { return n.toLocaleString('ko-KR'); }

// ===== MD 생성 =====
function generateMD(hospName, dept, rows, mainAgg, otherAgg, metric) {
  const mLabel = metric === 'pay' ? '급여' : metric === 'non' ? '비급여' : '총액';
  const mP = mainAgg.patientsByDept.get(dept)?.size || 0;
  const oP = otherAgg.patientsByDept.get(dept)?.size || 0;
  const mSums = mainAgg.sumsByDept.get(dept) || { pay: 0, non: 0 };
  const oSums = otherAgg.sumsByDept.get(dept) || { pay: 0, non: 0 };
  const mAmt = metric === 'pay' ? mSums.pay : metric === 'non' ? mSums.non : mSums.pay + mSums.non;
  const oAmt = metric === 'pay' ? oSums.pay : metric === 'non' ? oSums.non : oSums.pay + oSums.non;
  const mAov = mP > 0 ? Math.round(mAmt / mP) : 0;
  const oAov = oP > 0 ? Math.round(oAmt / oP) : 0;
  const diff = mAov - oAov;
  const sign = diff >= 0 ? '+' : '';
  const otherHosp = hospName === '대전선병원' ? '유성선병원' : '대전선병원';

  let md = `# ${hospName} - ${dept} 진료과 전용 EDI 목록\n`;
  md += `> 생성일: 2026-03-24 | 기준: ${mLabel}(제외 후) | 병실료/간호관리료 제외\n\n`;
  md += `## 분석 요약\n`;
  md += `- 진료과: ${dept}\n`;
  md += `- ${hospName} 환자수: ${fmtNum(mP)}명\n`;
  md += `- ${otherHosp} 환자수: ${fmtNum(oP)}명\n`;
  md += `- ${hospName} 객단가: ${fmtWon(mAov)}\n`;
  md += `- ${otherHosp} 객단가: ${fmtWon(oAov)}\n`;
  md += `- 객단가 차이(${hospName}-${otherHosp}): ${sign}${fmtWon(diff)}\n\n`;
  md += `## ${hospName} 전용 EDI (${otherHosp} 동일 진료과 미발생, 금액순 전체 ${rows.length}건)\n\n`;
  md += `| 순위 | EDI코드 | 수가명 | 총금액 | 발생수(환자기준) | 환자당평균 | 1회단가 | 타과존재 |\n`;
  md += `|------|---------|--------|--------|----------------|-----------|---------|----------|\n`;

  rows.forEach((r, i) => {
    const safeName = r.name.replace(/\|/g, '\\|');
    const crossStr = r.crossDepts.length > 0 ? r.crossDepts.join(', ') : '-';
    md += `| ${i + 1} | ${r.edi} | ${safeName} | ${fmtWon(r.total)} | ${fmtNum(r.patients)}건 | ${fmtWon(r.perPatient)} | ${fmtWon(r.perOccur)} | ${crossStr} |\n`;
  });

  return md;
}

// ===== CSV 생성 =====
function generateCSV(hospName, dept, rows) {
  const otherHosp = hospName === '대전선병원' ? '유성선병원' : '대전선병원';
  let csv = '\uFEFF'; // UTF-8 BOM
  csv += '병원,진료과,EDI코드,수가명,총금액,발생수(환자기준),환자당평균,1회단가,타과존재여부\n';
  for (const r of rows) {
    const safeName = r.name.replace(/,/g, ' ');
    const crossStr = r.crossDepts.length > 0 ? r.crossDepts.join('|') : '-';
    csv += `${hospName},${dept},${r.edi},${safeName},${r.total},${r.patients},${r.perPatient},${r.perOccur},${crossStr}\n`;
  }
  return csv;
}

// ===== 메인 =====
async function main() {
  // macOS NFD 정규화 대응: 파일명을 NFC로 변환해서 비교
  const files = fs.readdirSync(IMPORT_DIR).filter(f => f.endsWith('.CSV') || f.endsWith('.csv'));
  const daeFiles = files.filter(f => f.normalize('NFC').includes('대전')).map(f => path.join(IMPORT_DIR, f));
  const yusFiles = files.filter(f => f.normalize('NFC').includes('유성')).map(f => path.join(IMPORT_DIR, f));

  console.log(`대전 파일 ${daeFiles.length}개, 유성 파일 ${yusFiles.length}개`);

  const dae = newAgg('대전선병원');
  const yus = newAgg('유성선병원');

  console.log('대전 파싱 중...');
  for (const f of daeFiles) { console.log(' -', path.basename(f)); parseCSV(f, dae); }
  console.log('유성 파싱 중...');
  for (const f of yusFiles) { console.log(' -', path.basename(f)); parseCSV(f, yus); }

  console.log(`\n대전 총행수: ${dae.totalRows.toLocaleString()}, 유효: ${dae.validRows.toLocaleString()}`);
  console.log(`유성 총행수: ${yus.totalRows.toLocaleString()}, 유효: ${yus.validRows.toLocaleString()}`);

  const METRIC = 'total';

  for (const dept of TARGET_DEPTS) {
    console.log(`\n===== ${dept} =====`);
    const dP = dae.patientsByDept.get(dept)?.size || 0;
    const yP = yus.patientsByDept.get(dept)?.size || 0;
    const dSums = dae.sumsByDept.get(dept) || { pay: 0, non: 0 };
    const ySums = yus.sumsByDept.get(dept) || { pay: 0, non: 0 };
    const dAov = dP > 0 ? Math.round((dSums.pay + dSums.non) / dP) : 0;
    const yAov = yP > 0 ? Math.round((ySums.pay + ySums.non) / yP) : 0;
    console.log(`  대전: 환자 ${fmtNum(dP)}명, 객단가 ${fmtWon(dAov)}`);
    console.log(`  유성: 환자 ${fmtNum(yP)}명, 객단가 ${fmtWon(yAov)}`);

    // 대전 전용
    const daeRows = getExclusiveRows(dae, yus, dept, METRIC);
    console.log(`  대전 전용 EDI: ${daeRows.length}개`);
    const daeMD  = generateMD('대전선병원', dept, daeRows, dae, yus, METRIC);
    const daeCSV = generateCSV('대전선병원', dept, daeRows);
    fs.writeFileSync(path.join(OUT_DIR, `대전선병원_${dept}_전용EDI_${TODAY}.md`),  daeMD,  'utf8');
    fs.writeFileSync(path.join(OUT_DIR, `대전선병원_${dept}_전용EDI_${TODAY}.csv`), daeCSV, 'utf8');

    // 유성 전용
    const yusRows = getExclusiveRows(yus, dae, dept, METRIC);
    console.log(`  유성 전용 EDI: ${yusRows.length}개`);
    const yusMD  = generateMD('유성선병원', dept, yusRows, yus, dae, METRIC);
    const yusCSV = generateCSV('유성선병원', dept, yusRows);
    fs.writeFileSync(path.join(OUT_DIR, `유성선병원_${dept}_전용EDI_${TODAY}.md`),  yusMD,  'utf8');
    fs.writeFileSync(path.join(OUT_DIR, `유성선병원_${dept}_전용EDI_${TODAY}.csv`), yusCSV, 'utf8');
  }

  console.log(`\n✅ 완료: sample_export/ 에 ${TARGET_DEPTS.length * 4}개 파일 생성`);
}

main().catch(console.error);
