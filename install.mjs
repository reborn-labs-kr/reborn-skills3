#!/usr/bin/env node
/**
 * 스킬팩3(SNS 올인원) 설치기 — 팩2 설치기를 그대로 잇고 세 가지를 더했다.
 *   ① 자사 스킬 묶음(zip) — 공개 저장소에 없다. 서버가 산 사람에게만 15분짜리 서명 주소를 준다.
 *   ② 선택 칸 — 따로 돈이 드는 열쇠가 필요한 스킬은 `--with-optional` 일 때만 깐다.
 *   ③ 플러그인·안내 항목(kind≠skill) — 설치기가 깔지 않고 공식 명령만 보여 준다.
 *
 *   npx --yes reborn-skills3@latest <주문번호>
 *   node install.mjs --token=<주문번호> --with-optional  열쇠가 필요한 선택 스킬까지
 *   node install.mjs --token=<주문번호> --check     깔지 않고 지금 상태만
 *   node install.mjs --token=<주문번호> --no-rules  발동기(CLAUDE.md)는 안 건드린다
 *   node install.mjs --self-test                    검사기 자체 시험 (토큰 불필요)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ★★★팩1과 무엇이 다른가 — **발동기**
 * ═══════════════════════════════════════════════════════════════════════
 *   팩1은 「깔리는가」까지 한다. 그건 맞다. 그런데 2026-09-05 실측에서
 *   **깔아 둔 스킬 다섯 종이 3회 내내 한 번도 안 불렸다.**
 *   그중 셋은 팩1이 이미 담고 있던 것이다 — 고객은 깔았지만 안 불린다.
 *
 *   그래서 이 설치기는 한 걸음 더 간다: 지금 폴더의 `CLAUDE.md` 에
 *   **「언제 부르라」 한 대목**을 덧붙인다. 실측: 발동 **0/3 → 3/3**.
 *
 * ★★목록을 이 패키지에 박아 두지 않는다. **서버가 토큰을 보고 산 만큼만 준다.**
 *   박아 두면 ① 구성을 바꿀 때마다 npm 을 다시 내야 하고
 *   ② 돈을 안 낸 사람도 `npx` 한 번이면 설치 명령을 통째로 가져간다.
 *   (팩1 `reborn-skills-all` 과 같은 구조다. 그쪽 주석에 이유가 더 적혀 있다.)
 *   ★여기 동봉되는 파일은 `발동기.md` 하나뿐이고, 그건 **우리가 쓴 우리 글**이다.
 *     스킬 파일은 하나도 담지 않는다(벤더링 금지) — 원저자의 공식 설치 명령만 부른다.
 *   ★`karpathy-guidelines` 는 원저장소에 라이선스가 없다 = 재배포 금지가 기본값이다.
 *     파일로 담으면 그 순간 위법이다. 설치 명령으로만 붙인다.
 *
 * ★★종료코드로 판정하지 않는다. (팩1에서 실제로 겪은 일)
 *   설치 명령이 0 으로 끝나도 안 붙어 있을 수 있고, 0이 아니어도 붙어 있을 수 있다.
 *   끝나고 **두 축으로 다시 본다** — ① `skills list -g` 에 뜨는가 ② 파일이 있는가.
 *   하나만 통과하면 통과라고 하지 않는다. 어긋났다고 그대로 말한다.
 *
 * ★★`--yes` 를 빼지 않는다 (팩1 2026-08-27 구매자 실사고).
 *   클로드 코드의 `!` 모드는 stdin 이 없어서 npx 의 «Ok to proceed?» 에 답할 수 없다 —
 *   묻는 채로 영원히 멈추고 출력이 한 줄도 안 나온다.
 */
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, cpSync, rmSync, statSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = homedir();
const 여기 = dirname(fileURLToPath(import.meta.url));
const 인자 = process.argv.slice(2);
const 확인만 = 인자.includes("--check");
const 자기시험 = 인자.includes("--self-test");
const 규칙끄기 = 인자.includes("--no-rules");
const 선택도 = 인자.includes("--with-optional");
/** `--lang=en` · `--lang=ko`. 안 주면 컴퓨터 로케일로 정한다(→ `말정하기`). */
const 말강제 = (인자.find((a) => a.startsWith("--lang=")) || "").slice(7).toLowerCase();

/** 주문번호 — 팩1과 **같은 세 형태**를 받는다. 이미 나간 메일·완료화면을 깨지 않는다. */
export function 토큰뽑기(a, env = {}) {
  const 이름붙은 = a.find((x) => x.startsWith("--token="));
  if (이름붙은) return 이름붙은.slice("--token=".length).trim();
  const i = a.indexOf("--token");
  if (i >= 0 && a[i + 1] && !a[i + 1].startsWith("--")) return a[i + 1].trim();
  const 값 = (a.find((x) => !x.startsWith("--")) || env.REBORN_SKILLPACK_TOKEN || "").trim();
  /* ★주소를 통째로 붙여넣은 경우 — 주소에 t= 가 있으면 그것을, 없으면 비운다(주소를 번호로 서버에 보내지 않는다).
       완료 화면 주소의 o= 는 주문 id 라 설치 번호가 아니다. */
  if (/^https?:\/\//i.test(값)) { try { return (new URL(값).searchParams.get("t") || "").trim(); } catch { return ""; } }
  return 값;
}
const 토큰 = 토큰뽑기(인자, process.env);

const 서버 = process.env.REBORN_SKILLPACK_ORIGIN || "https://mobility.rebornlabs.kr";
const 착지 = "https://rebornlabs.kr/skillpack3?utm_source=installer&utm_medium=cli&utm_campaign=skillpack3";
const CS = "https://mobility.rebornlabs.kr/cs";

const c = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[90m", cy: "\x1b[36m", b: "\x1b[1m", 0: "\x1b[0m" };
const 원 = (n) => Number(n).toLocaleString("ko-KR");
const 줄 = (s = "") => console.log(s);

/* ── 바깥 명령 ──────────────────────────────────────────────────────── */
/* ★★윈도우에서는 **셸을 거쳐야** npx 가 뜬다 (2026-09-26 종단 시험에서 잡음).
     노드 18.20·20.12 부터 보안 수정으로 `.cmd` 를 셸 없이 spawn 하면 EINVAL 로 **즉사**한다 —
     출력 0줄·종료코드 null 이라 설치기는 모든 스킬을 「아직 없습니다」로만 적었다.
     팩1 설치기(reborn-skills-all)는 처음부터 셸을 거쳐서 이 병이 없었다.
     인자는 우리 서버가 주는 `skills add <저장소> --skill <이름>` 뿐이지만, 그래도 따옴표로 싼다. */
export const 따옴 = (a) => (/^[A-Za-z0-9@._\/:=+-]+$/.test(String(a)) ? String(a) : `"${String(a).replace(/"/g, '\\"')}"`);
const 돌리기 = (args, timeout = 600000) =>
  process.platform === "win32"
    ? spawnSync(`npx ${args.map(따옴).join(" ")}`, { encoding: "utf8", timeout, windowsHide: true, shell: true })
    : spawnSync("npx", args, { encoding: "utf8", timeout, windowsHide: true });

let _목록캐시 = null;
function 설치목록(다시 = false) {
  if (_목록캐시 && !다시) return _목록캐시;
  const r = 돌리기(["-y", "skills@latest", "list", "-g"], 120000);
  const 깨끗 = String((r.stdout || "") + (r.stderr || "")).replace(/\x1b\[[0-9;]*m/g, "");
  _목록캐시 = { ok: r.status === 0, 이름들: 이름뽑기(깨끗) };
  return _목록캐시;
}

/** `이름   경로` 꼴의 줄에서 첫 칸만. ★색 코드를 걷어낸다 — 안 걷으면 전건 실패한다. */
export function 이름뽑기(텍스트) {
  const 결과 = [];
  // ★색 코드를 여기서도 걷는다. 부르는 쪽이 이미 걷지만, 안 걷힌 글이 들어오면
  //   이름이 `\x1b[36mhumanizer` 로 잡혀 **전건 실패**한다(팩1에서 실제로 겪었다).
  //   막는 자리가 하나뿐이면 그 자리를 안 거치는 길이 생기는 날 조용히 무너진다.
  for (const l of String(텍스트 || "").replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/)) {
    /* ★묶음에 스킬이 하나뿐이면 `skills list` 는 이름 뒤에 **빈칸 한 칸**만 두고 경로를 붙인다
         (2026-09-26 종단 시험 — `karpathy-guidelines C:\\Users\\…`). 두 칸만 보던 판정이
         그런 스킬을 전부 「파일은 있는데 목록에 안 뜹니다」로 적었다. → 이름 뒤에 경로가 오면 잡는다. */
    const m = l.match(/^\s*([A-Za-z0-9][A-Za-z0-9_\-.]*)\s+(?:[A-Za-z]:[\\/]|\/|~)/)
      || l.match(/^\s*([A-Za-z0-9][A-Za-z0-9_\-.]*)\s{2,}/) || l.match(/^\s*([A-Za-z0-9][A-Za-z0-9_\-.]*)\s*$/);
    if (m) 결과.push(m[1]);
  }
  return [...new Set(결과)];
}

export function 파일로있나(이름) {
  for (const 뿌리 of [join(HOME, ".claude", "skills"), join(HOME, ".config", "claude", "skills")]) {
    const p = join(뿌리, 이름, "SKILL.md");
    if (!existsSync(p)) continue;
    try { return /^---[\s\S]*?\bname\s*:/m.test(readFileSync(p, "utf8")); } catch { return false; }
  }
  return false;
}

/** 두 축으로 본다. 하나만 통과하면 「반쪽」이라고 말한다 — 통과라고 하지 않는다. */
export function 상태(s, 목록) {
  const 후보 = [s.skill, ...(s.alt || [])].filter(Boolean);
  const 목록에 = 후보.some((n) => 목록.이름들.includes(n));
  const 파일에 = 후보.some((n) => 파일로있나(n));
  if (목록에 && 파일에) return { 급: "ok", 말: "설치됨" };
  if (목록에 || 파일에) return { 급: "반쪽", 말: 목록에 ? "목록엔 있는데 파일이 없습니다" : "파일은 있는데 목록에 안 뜹니다" };
  return { 급: "없음", 말: "아직 없습니다" };
}

/* ── 발동기 ─────────────────────────────────────────────────────────────
   ★홈 폴더가 아니라 **지금 폴더**의 CLAUDE.md 다. 홈에 만들면 모든 프로젝트에 딸려 간다.
   ★덮어쓰지 않고 뒤에 덧붙인다. 그 파일은 고객이 자기 지침을 적어 둔 파일이다.
   ★이미 우리 대목이 있으면 다시 넣지 않는다(재설치 때 두 번 들어가면 토큰만 먹는다). */
export const 표식 = "reborn:스킬팩3:발동기";
/** 영문판 표식. ★한국어판과 **다른 글자**다 — 둘 다 봐야 재설치 때 두 벌이 안 들어간다. */
export const 표식_en = "reborn:skillpack3:triggers";
/** 일본어판 표식(2026-09-26 국가런칭). ★세 벌 다 서로 달라야 재설치 때 겹쳐 들어가지 않는다. */
export const 표식_ja = "reborn:skillpack3:triggers:ja";

/**
 * 어느 말로 넣을까. (2026-09-20 · 영어권 1차 · 인계 §H)
 *
 * ★**고객 컴퓨터의 로케일이 곧 그 사람이 읽는 말이다.** 서버에 묻지 않는 이유는
 *   토큰 발급·검증(`skillpack-verify`)에 국경이 없기 때문이다 — 그쪽은 고치지 않는다(인계 §C).
 * ★못 읽으면 한국어로 떨어진다. 지금 사는 사람의 절대다수가 한국 고객이라,
 *   판정이 실패했을 때 덜 틀리는 쪽이 그쪽이다.
 */
// ==국가런칭:말정하기 시작==
/**
 * 어느 말로 말할 것인가. (2026-09-26 국가런칭 · 공용본)
 *
 * ★강제 인자(`--lang=xx`)가 지원 언어 안에 있으면 그것을 그대로 쓴다.
 * ★없으면 이 컴퓨터의 로케일로 정한다 — `ko`→한국어, `ja`→일본어, 그 밖은 전부 영어.
 * ★예외가 나면(로케일을 못 읽는 드문 환경) 한국어로 떨어진다 — 기존 동작 그대로다.
 *   지금 사는 사람의 절대다수가 한국 고객이라, 판정이 실패했을 때 덜 틀리는 쪽이 그쪽이다.
 */
const 지원언어 = ["ko", "en", "ja"];

export function 말정하기(강제) {
  if (지원언어.includes(강제)) return 강제;
  try {
    const 로케일 = Intl.DateTimeFormat().resolvedOptions().locale || "";
    if (/^ko\b/i.test(로케일)) return "ko";
    if (/^ja\b/i.test(로케일)) return "ja";
    return "en";
  } catch { return "ko"; }
}
// ==국가런칭:말정하기 끝==

export function 발동기상태(폴더 = process.cwd()) {
  const 파일 = join(폴더, "CLAUDE.md");
  if (!existsSync(파일)) return { 급: "없음", 말: "CLAUDE.md 가 아직 없습니다", 파일 };
  const 글 = readFileSync(파일, "utf8");
  /* ★두 표식 중 **하나라도** 있으면 들어 있는 것으로 본다.
     한 벌만 봤다가는 말을 바꿔 다시 깔 때 같은 내용이 두 언어로 들어가고,
     그건 고객의 매 대화에 두 번 실린다 — 우리가 팔려던 것의 정반대다. */
  /* ★표식 글자만 있고 정식 시작 태그가 없으면 들어 있지 않은 것이다 — 글자만 보고 「이미 있다」고 하면
       발동기가 없는데 성공으로 찍힌다(2026-09-26 코덱스 2차) */
  return 시작표식들(글).length
    ? { 급: "ok", 말: "이미 들어 있습니다", 파일 }
    : { 급: "없음", 말: "CLAUDE.md 는 있는데 발동기는 아직 없습니다", 파일 };
}

const 시작태그 = /<!-- reborn:(스킬팩3:발동기|skillpack3:triggers:ja|skillpack3:triggers) v\d+[^>]*-->/g;
const 시작표식들 = (글) => [...글.matchAll(시작태그)];

/** 캡처된 그룹 문자열 → 그 블록의 언어. */
const 말로 = (그룹) => (그룹 === "skillpack3:triggers" ? "en" : 그룹 === "skillpack3:triggers:ja" ? "ja" : "ko");

/** CLAUDE.md 안 발동기 블록들의 [시작, 끝) 과 언어. 하나라도 끝 표식이 없으면 null(고객이 손댄 것 — 안 건드린다).
 *  ★여러 벌일 수 있다(옛 버그·손 복구로 한·영·일이 섞여 들어간 파일) — 전부 돌려준다. */
export function 발동기자리들(글) {
  const 자리들 = [];
  for (const 시 of 시작표식들(글)) {
    const 끝말 = 시[1] === "skillpack3:triggers" ? "<!-- reborn:skillpack3:triggers end (en) -->"
      : 시[1] === "skillpack3:triggers:ja" ? "<!-- reborn:skillpack3:triggers:ja end -->"
        : "<!-- reborn:스킬팩3:발동기 끝 -->";
    const 끝 = 글.indexOf(끝말, 시.index);
    if (끝 < 0) return null;
    자리들.push({ 시작: 시.index, 끝: 끝 + 끝말.length, 말: 말로(시[1]) });
  }
  /* 겹치면(끝 표식이 다음 블록 뒤에서 잡힘) 구조가 깨진 것 — 손대지 않는다 */
  for (let i = 1; i < 자리들.length; i++) if (자리들[i].시작 < 자리들[i - 1].끝) return null;
  return 자리들.length ? 자리들 : null;
}
export const 발동기자리 = (글) => 발동기자리들(글)?.[0] ?? null;

/**
 * 화면에 찍는 말(터미널 정적 문구만) — 서버가 주는 값(s.title·s.ko·답.이유·깔지말까 사유 등)은
 * 서버 쪽 언어를 그대로 따른다(2026-09-26 국가런칭). ★한국어 문구는 한 글자도 바꾸지 않고 옮겨 담기만 했다.
 */
const 글표 = {
  ko: {
    머리: "스킬팩3 — SNS 올인원",
    머리부제: "홈페이지·이미지·영상·SNS 운영·아끼기·교차검수 (스킬팩2 포함)",
    주문번호없음: "주문번호가 없습니다.",
    주소로착각: "화면 주소를 넣으셨습니다. 주소 말고, 결제 완료 화면·메일에 있는 «붙여넣을 한 줄»을 그대로 복사해 주세요.",
    주문번호안내: "결제 완료 화면(또는 메일)의 명령을 그대로 붙여넣어 주세요. 이런 모양입니다 —",
    주문번호예시: "npx --yes reborn-skills3@latest <주문번호>",
    느낌표안내: "클로드 코드 안에서는 맨 앞에 ",
    느낌표안내뒤: " 를 붙이세요.",
    아직안샀다면: (착지) => `아직 안 사셨다면 → ${착지}`,
    이유못찾음: "주문번호를 확인하지 못했습니다.",
    막히면: (cs) => `막히시면 화면을 그대로 캡처해 보내 주세요 — ${cs}`,
    목록빔: (cs) => `받을 스킬 목록이 비어 있습니다. 고객센터로 알려 주세요 — ${cs}`,
    팩기본이름: "스킬팩3",
    종수남은설치: (n, 남은, 일) => `${n}종 · 남은 설치 ${남은}회 (${일}일 기준)`,
    상시자리: (금액) => `안 쓰는 날에도 차지하는 자리 ${금액} — 저희가 하나씩 직접 잰 값입니다.`,
    묶음머리: (n) => `저희가 만든 스킬 ${n || ""}가지`,
    묶음부제: "— 여러 스킬을 한 명령으로 이어 주는 지휘 스킬 · 한국 SNS 규격 · 아끼기 규칙",
    묶음받는중: "  받아서 풉니다 … ",
    묶음실패이름: "저희가 만든 스킬 묶음",
    묶음못받음: "※ 저희가 만든 스킬 묶음을 이번에 받지 못했습니다. 잠시 뒤 같은 명령을 다시 돌려 주세요.",
    묶음못받음사유: "서버가 주소를 주지 못함",
    목록못읽음: "※ skills 목록을 못 읽었습니다. 파일 쪽만 보고 판정합니다.",
    직접까실때: (명령) => `직접 까실 때: ${명령}`,
    이미설치됨: "이미 설치돼 있습니다.",
    확인만안내: (말) => `${말} (--check 라 설치하지 않았습니다)`,
    설치명령없음: "설치 명령이 오지 않았습니다. 고객센터로 알려 주세요.",
    깝니다: "  깝니다 … ",
    됐습니다: "됐습니다",
    손으로: (명령) => `손으로: npx ${명령}`,
    언제펴라제목: "«언제 펴라» 쪽지",
    언제펴라부제: "— 깔아 둔 설명서를 AI 가 실제로 펴 보게 만듭니다",
    언제펴라설명: "저희가 재 봤을 때 이 중 다섯은 3번 내내 한 번도 안 불렸습니다. 이 쪽지를 넣자 3번 다 불렸습니다.",
    확인만발동기: (말) => `${말} (--check 라 건드리지 않았습니다)`,
    막힌것머리: (n) => `막힌 것 ${n}개`,
    모션팩머리: "움직임 부품 140가지",
    모션팩부제: "— 같은 주문번호로 따로 받습니다(영상 파일로 뽑으려면 ffmpeg 필요)",
    재시작안내: "★다 깐 다음 클로드 코드를 껐다 켜셔야 적용됩니다. 그다음 «이번 주 콘텐츠 짜줘» 라고 말해 보세요.",
    재는법: (착지) => `재는 법과 원자료는 여기에 적어 두었습니다 — ${착지}`,
  },
  en: {
    머리: "Skill Pack 3 — SNS all-in-one",
    머리부제: "Homepage, images, video, SNS ops, token savings, cross-review (includes Skill Pack 2)",
    주문번호없음: "No order number.",
    주소로착각: "That looks like a page address. Instead, copy the exact «one line to paste» from your confirmation page or email.",
    주문번호안내: "Paste the command from your confirmation page (or email) exactly as it is. It looks like —",
    주문번호예시: "npx --yes reborn-skills3@latest <order number>",
    느낌표안내: "Inside Claude Code, put a ",
    느낌표안내뒤: " in front.",
    아직안샀다면: (착지) => `Haven't bought it yet → ${착지}`,
    이유못찾음: "We could not verify that order number.",
    막히면: (cs) => `Stuck? Send us a screenshot of this screen — ${cs}`,
    목록빔: (cs) => `Your skill list came back empty. Please let us know — ${cs}`,
    팩기본이름: "Skill Pack 3",
    종수남은설치: (n, 남은, 일) => `${n} skills · ${남은} installs left (per ${일}-day window)`,
    상시자리: (금액) => `Standing footprint even on days you don't use it: ${금액} — we measured each one ourselves.`,
    묶음머리: (n) => `${n || ""} skills we built ourselves`,
    묶음부제: "— an orchestrator skill that chains several skills in one command · Korean SNS specs · token-saving rules",
    묶음받는중: "  fetching and unpacking … ",
    묶음실패이름: "Our own skill bundle",
    묶음못받음: "※ We could not fetch our own skill bundle this time. Please run the same command again in a moment.",
    묶음못받음사유: "server did not return an address",
    목록못읽음: "※ Could not read the skills list. Judging by files only.",
    직접까실때: (명령) => `To install it yourself: ${명령}`,
    이미설치됨: "Already installed.",
    확인만안내: (말) => `${말} (--check, so nothing was installed)`,
    설치명령없음: "No install command came back. Please let us know.",
    깝니다: "  installing … ",
    됐습니다: "done",
    손으로: (명령) => `by hand: npx ${명령}`,
    언제펴라제목: "«when to open it» note",
    언제펴라부제: "— makes the AI actually open the docs we installed",
    언제펴라설명: "In our own measurements, five of these never fired once across 3 tries. With this note in place, all 3 tries fired.",
    확인만발동기: (말) => `${말} (--check, so nothing was touched)`,
    막힌것머리: (n) => `${n} stuck`,
    모션팩머리: "140 motion parts",
    모션팩부제: "— fetched separately with the same order number (needs ffmpeg to render to video files)",
    재시작안내: "★Restart Claude Code once everything is installed, then try «plan this week's content».",
    재는법: (착지) => `How we measured this, and the raw data, are here — ${착지}`,
  },
  ja: {
    머리: "スキルパック3 — SNSオールインワン",
    머리부제: "ホームページ・画像・動画・SNS運用・節約・相互検証（スキルパック2を含む）",
    주문번호없음: "注文番号がありません。",
    주소로착각: "ページのアドレスが入力されています。アドレスではなく、決済完了画面・メールにある「貼り付ける一行」をそのままコピーしてください。",
    주문번호안내: "決済完了画面（またはメール）のコマンドをそのまま貼り付けてください。次のような形です —",
    주문번호예시: "npx --yes reborn-skills3@latest <注文番号>",
    느낌표안내: "Claude Code の中では先頭に ",
    느낌표안내뒤: " を付けてください。",
    아직안샀다면: (착지) => `まだご購入でない場合 → ${착지}`,
    이유못찾음: "ご注文番号を確認できませんでした。",
    막히면: (cs) => `うまくいかない場合はこの画面をそのままキャプチャして送ってください — ${cs}`,
    목록빔: (cs) => `受け取るスキルの一覧が空です。カスタマーサポートまでご連絡ください — ${cs}`,
    팩기본이름: "スキルパック3",
    종수남은설치: (n, 남은, 일) => `${n}種 · 残りインストール回数 ${남은}回（${일}日基準）`,
    상시자리: (금액) => `使わない日でも占める容量 ${금액} — 弊社が一つずつ実際に測定した値です。`,
    묶음머리: (n) => `弊社が作ったスキル ${n || ""}種`,
    묶음부제: "— 複数のスキルを1コマンドでつなぐ指揮スキル · 韓国SNS規格 · 節約ルール",
    묶음받는중: "  受け取って展開中 … ",
    묶음실패이름: "弊社が作ったスキル一式",
    묶음못받음: "※ 弊社が作ったスキル一式を今回は受け取れませんでした。しばらくしてから同じコマンドをもう一度実行してください。",
    묶음못받음사유: "サーバーがアドレスを返さなかった",
    목록못읽음: "※ skills 一覧を読み取れませんでした。ファイル側だけで判定します。",
    직접까실때: (명령) => `ご自身でインストールする場合: ${명령}`,
    이미설치됨: "既にインストールされています。",
    확인만안내: (말) => `${말}（--check のためインストールしていません）`,
    설치명령없음: "インストールコマンドが届きませんでした。カスタマーサポートまでご連絡ください。",
    깝니다: "  インストール中 … ",
    됐습니다: "完了しました",
    손으로: (명령) => `手動で: npx ${명령}`,
    언제펴라제목: "「いつ開くか」メモ",
    언제펴라부제: "— インストールした説明書をAIが実際に開くようにします",
    언제펴라설명: "弊社の実測では、このうち5つが3回中一度も呼ばれませんでした。このメモを入れると3回とも呼ばれました。",
    확인만발동기: (말) => `${말}（--check のため変更していません）`,
    막힌것머리: (n) => `詰まったもの ${n}件`,
    모션팩머리: "モーションパーツ140種",
    모션팩부제: "— 同じ注文番号で別途受け取ります（動画ファイルに書き出すには ffmpeg が必要です）",
    재시작안내: "★すべてインストールした後、Claude Code を再起動してから「今週のコンテンツ組んで」と話しかけてみてください。",
    재는법: (착지) => `測り方と元データはこちらに記載しています — ${착지}`,
  },
};
const 말표시 = 말정하기(말강제);
const G = 글표[말표시] || 글표.ko;

export function 발동기깔기(폴더 = process.cwd(), 말 = 말정하기()) {
  const 이름 = 말 === "ja" ? "발동기3.ja.md" : 말 === "en" ? "발동기3.en.md" : "발동기3.md";
  const 원본 = join(여기, 이름);
  if (!existsSync(원본)) return { 급: "실패", 말: `${이름} 가 옆에 없습니다 — 고객센터로 알려 주세요` };
  const st = 발동기상태(폴더);
  const 새글 = readFileSync(원본, "utf8");
  if (st.급 === "ok") {
    /* ★이미 들어 있으면 **판을 본다.** 옛 코드는 「건드리지 않았습니다」로 넘어가서, 이미 산 사람은
         설치기를 다시 돌려도 고친 발동기를 영영 못 받았다(2026-09-26 — 틀린 스킬 이름 7곳을 고친 판).
         시작~끝 표식 사이만 바꾸고 바깥의 고객 글은 한 글자도 안 건드린다.
         들어 있는 언어를 따른다 — 영문판 위에 한국어판을 얹으면 매 대화에 두 벌이 실린다. */
    const 글 = readFileSync(st.파일, "utf8");
    const 자리들 = 발동기자리들(글);
    if (!자리들) return { 급: "주의", 말: "들어 있지만 끝 표식이 없어 건드리지 않았습니다(직접 고치신 것으로 봅니다)" };
    const 자리 = 자리들[0];
    const 판 = 자리.말 === 말 ? 새글
      : readFileSync(join(여기, 자리.말 === "ja" ? "발동기3.ja.md" : 자리.말 === "en" ? "발동기3.en.md" : "발동기3.md"), "utf8");
    if (자리들.length === 1 && 글.slice(자리.시작, 자리.끝).trim() === 판.trim()) return { 급: "ok", 말: "이미 최신판이 들어 있습니다" };
    /* 첫 블록 자리에 새 판 한 벌 · 나머지 블록은 지운다(블록 사이의 고객 글은 그대로) */
    let 새 = 글.slice(0, 자리.시작) + 판.trim();
    for (let i = 1; i < 자리들.length; i++) 새 += 글.slice(자리들[i - 1].끝, 자리들[i].시작).replace(/\n*---\n*$/, "\n");
    새 += 글.slice(자리들[자리들.length - 1].끝);
    writeFileSync(st.파일, 새, "utf8");
    return { 급: "ok", 말: 자리들.length > 1 ? `두 벌 이상 들어 있던 것을 새 판 한 벌로 합쳤습니다(다른 내용은 그대로)` : "새 판으로 바꿨습니다(다른 내용은 그대로)" };
  }
  const 있던것 = existsSync(st.파일);
  const 기존 = 있던것 ? readFileSync(st.파일, "utf8") : "";
  writeFileSync(st.파일, (있던것 && 기존.trim() ? 기존.replace(/\s*$/, "") + "\n\n---\n\n" : "") + 새글, "utf8");
  return { 급: "ok", 말: 있던것 ? "기존 CLAUDE.md 뒤에 덧붙였습니다" : `새로 만들었습니다 (${st.파일})` };
}

/* ── 서버에서 산 것을 받아온다 ─────────────────────────────────────── */
async function 받아오기(t) {
  let res;
  try {
    res = await fetch(`${서버}/api/skillpack-verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: t, v: 1 }),
    });
  } catch (e) {
    return { ok: false, 이유: `서버에 닿지 못했습니다(${e?.message || "네트워크"}). 잠시 뒤 다시 시도해 주세요.` };
  }
  if (!res.ok) {
    if (res.status === 404 || res.status === 403)
      return { ok: false, 이유: "주문번호가 확인되지 않았습니다. 결제 완료 화면의 명령을 그대로 다시 붙여넣어 주세요." };
    if (res.status === 429)
      return { ok: false, 이유: `사용 횟수를 다 썼습니다. 고객센터로 알려 주시면 다시 열어 드립니다 — ${CS}` };
    return { ok: false, 이유: `서버가 ${res.status} 을 돌려주었습니다. 잠시 뒤 다시 시도해 주세요.` };
  }
  try { return await res.json(); }
  catch { return { ok: false, 이유: "서버 응답을 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요." }; }
}

/* ★결과를 되돌려 보낸다. **기다리지 않고, 실패해도 설치를 막지 않는다** —
     계측이 제품을 방해하면 안 된다. */
async function 보고(몸통) {
  try {
    await fetch(`${서버}/api/skillpack-report`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(몸통),
    });
  } catch { /* 계측 실패는 삼킨다 */ }
}

/* ── 팩3 에서 더한 것 ────────────────────────────────────────────────── */

/** 깔지 말아야 하면 그 이유(화면에 쓸 말), 깔면 null. */
export function 깔지말까(s, 선택포함) {
  if ((s.kind || "skill") !== "skill") return "설치기가 대신 깔 수 없는 형식이라 명령만 적어 드립니다";
  if (s.optional && !선택포함) return "따로 돈이 드는 열쇠가 필요해 기본으로는 안 깝니다 (--with-optional 로 깔 수 있습니다)";
  return null;
}

/** zip 이 한 겹 폴더로 싸여 있으면 한 번 들어간다. */
function 묶음뿌리(뿌리) {
  const 첫 = readdirSync(뿌리).filter((x) => statSync(join(뿌리, x)).isDirectory());
  return 첫.length === 1 && !existsSync(join(뿌리, 첫[0], "SKILL.md")) ? join(뿌리, 첫[0]) : 뿌리;
}

/** 풀어 놓은 폴더에서 스킬 폴더(= 바로 아래에 SKILL.md 가 있는 폴더) 이름만 고른다. */
export function 묶음폴더들(뿌리) {
  const 안 = 묶음뿌리(뿌리);
  return readdirSync(안).filter((x) => existsSync(join(안, x, "SKILL.md"))).sort();
}

/** zip 을 푼다. ★한 가지 도구에 기대지 않는다 — 리눅스 최소 설치엔 unzip 이 없고,
 *  윈도우 사용자 이름에 작은따옴표가 있으면 PowerShell 문자열이 깨진다. 되는 길을 차례로 시도한다. */
export function 풀기(zip, 곳) {
  const 된다 = (r) => r && r.status === 0 && readdirSync(곳).length > 0;
  const q = (p) => p.replace(/'/g, "''");
  const 길들 = process.platform === "win32"
    ? [["powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${q(zip)}' -DestinationPath '${q(곳)}' -Force`]],
       /* 윈도우 10+ 기본 tar(bsdtar)는 zip 을 푼다. 이름만 부르면 깃의 GNU tar 가 잡혀 C: 를 원격으로 읽는다 */
       [join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe"), ["-xf", zip, "-C", 곳]]]
    : [["unzip", ["-o", "-q", zip, "-d", 곳]],
       ["bsdtar", ["-xf", zip, "-C", 곳]],
       ["python3", ["-m", "zipfile", "-e", zip, 곳]],
       ["tar", ["-xf", zip, "-C", 곳]]];
  for (const [cmd, args] of 길들) {
    try { if (된다(spawnSync(cmd, args, { encoding: "utf8", windowsHide: true }))) return true; } catch { /* 다음 길 */ }
  }
  return false;
}

/** ★풀기 **전에** zip 목록을 직접 읽어 검사한다 — 풀고 나서 보면 쓰기는 이미 일어난 뒤다(코덱스 2차).
 *  중앙 디렉터리만 읽는다: 절대경로 · 드라이브 · `..` · 심볼릭 링크가 하나라도 있으면 거부. */
export function zip안전(buf) {
  try {
    let e = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
    if (e < 0) return false;
    const 개수 = buf.readUInt16LE(e + 10);
    let p = buf.readUInt32LE(e + 16);
    if (!개수) return false;
    for (let k = 0; k < 개수; k++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) return false;
      const 만든곳 = buf[p + 5], n = buf.readUInt16LE(p + 28), x = buf.readUInt16LE(p + 30), c = buf.readUInt16LE(p + 32);
      const 속성 = buf.readUInt32LE(p + 38);
      const 이름 = buf.slice(p + 46, p + 46 + n).toString("utf8");
      if (만든곳 === 3 && ((속성 >>> 16) & 0o170000) === 0o120000) return false;
      if (/^[\\/]/.test(이름) || /^[a-zA-Z]:/.test(이름) || 이름.split(/[\\/]/).includes("..")) return false;
      p += 46 + n + x + c;
    }
    return true;
  } catch { return false; }
}

/** 풀린 파일이 전부 뿌리 안에 있고 심볼릭 링크가 없는지. */
export function 안쪽만(뿌리) {
  const 기준 = realpathSync(뿌리);
  const 걷기 = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isSymbolicLink()) return false;
      if (!realpathSync(p).startsWith(기준)) return false;
      if (e.isDirectory() && !걷기(p)) return false;
    }
    return true;
  };
  try { return 걷기(뿌리); } catch { return false; }
}

/** 자사 스킬 zip 을 받아 ~/.claude/skills 에 푼다. ★우리 폴더 이름만 덮는다 — 남의 스킬은 안 건드린다. */
async function 묶음깔기(묶음) {
  const 임시 = mkdtempSync(join(tmpdir(), "reborn-skills3-"));
  try {
    const r = await fetch(묶음.url);
    if (!r.ok) return { ok: false, 말: `묶음을 받지 못했습니다(${r.status}). 다시 돌리시면 새 주소로 받습니다.` };
    const zip = join(임시, "bundle.zip");
    const 받은것 = Buffer.from(await r.arrayBuffer());
    if (!zip안전(받은것)) return { ok: false, 말: "묶음 안에 이상한 경로가 있어 설치를 멈췄습니다. 고객센터로 알려 주세요." };
    writeFileSync(zip, 받은것);
    const 풀곳 = join(임시, "x");
    mkdirSync(풀곳, { recursive: true });
    if (!풀기(zip, 풀곳)) return { ok: false, 말: "묶음을 풀지 못했습니다(압축 풀 도구가 없습니다). 화면을 캡처해 보내 주세요." };
    /* ★풀린 것이 임시 폴더 밖을 가리키면 거부한다(zip 경로 넘기기) — 우리 버킷이지만 올리기 실수 대비 */
    if (!안쪽만(풀곳)) return { ok: false, 말: "묶음 안에 이상한 경로가 있어 설치를 멈췄습니다. 고객센터로 알려 주세요." };
    const 뿌리 = 묶음뿌리(풀곳);
    const 폴더들 = 묶음폴더들(풀곳);
    const 스킬자리 = join(HOME, ".claude", "skills");
    mkdirSync(스킬자리, { recursive: true });
    for (const f of 폴더들) cpSync(join(뿌리, f), join(스킬자리, f), { recursive: true, force: true });
    const 확인 = 폴더들.filter((f) => 파일로있나(f));
    return { ok: 폴더들.length > 0 && 확인.length === 폴더들.length, 폴더들, 확인,
      말: `${확인.length}/${폴더들.length}개 깔렸습니다` };
  } catch (e) {
    return { ok: false, 말: `묶음을 깔지 못했습니다(${e?.message || "?"})` };
  } finally {
    try { rmSync(임시, { recursive: true, force: true }); } catch { /* 임시 폴더는 남아도 된다 */ }
  }
}

/* ── 자기 시험 ─────────────────────────────────────────────────────────
   ★한 번도 안 지는 검사기는 검사기가 아니다. 일부러 깨진 입력을 넣어 잡히는지 본다. */
function 자기시험돌리기() {
  let 통과 = 0, 실패 = 0;
  const T = (이름, 참) => { 참 ? (통과++, 줄(`  ${c.g}✓${c[0]} ${이름}`)) : (실패++, 줄(`  ${c.r}✗${c[0]} ${이름}`)); };
  줄(`\n${c.b}자기 시험${c[0]}\n`);

  T("발동기3.md 가 옆에 있다", existsSync(join(여기, "발동기3.md")));
  T("★발동기3.md 에 표식이 있다 (지우는 법이 성립한다)",
    existsSync(join(여기, "발동기3.md")) && readFileSync(join(여기, "발동기3.md"), "utf8").includes(표식));
  T("발동기3.en.md 가 옆에 있다", existsSync(join(여기, "발동기3.en.md")));
  T("★발동기3.en.md 에 영문 표식이 있다 (지우는 법이 성립한다)",
    existsSync(join(여기, "발동기3.en.md")) && readFileSync(join(여기, "발동기3.en.md"), "utf8").includes(표식_en));
  T("★★영문판에 한글이 없다 (미국 고객의 CLAUDE.md 에 들어가는 글이다)",
    existsSync(join(여기, "발동기3.en.md")) && !/[가-힣]/.test(readFileSync(join(여기, "발동기3.en.md"), "utf8")));
  T("발동기3.ja.md 가 옆에 있다 (2026-09-26 국가런칭)", existsSync(join(여기, "발동기3.ja.md")));
  T("★발동기3.ja.md 에 일본어 표식이 있다 (지우는 법이 성립한다)",
    existsSync(join(여기, "발동기3.ja.md")) && readFileSync(join(여기, "발동기3.ja.md"), "utf8").includes(표식_ja));
  T("★★일본어판에 한글이 없다 (일본 고객의 CLAUDE.md 에 들어가는 글이다)",
    existsSync(join(여기, "발동기3.ja.md")) && !/[가-힣]/.test(readFileSync(join(여기, "발동기3.ja.md"), "utf8")));
  T("★세 표식이 서로 다르다 (한 벌만 보면 언어가 겹쳐 들어간다)",
    new Set([표식, 표식_en, 표식_ja]).size === 3);
  T("★시작태그가 일본어 블록도 잡는다",
    시작표식들("<!-- reborn:skillpack3:triggers:ja v1 -->").length === 1
    && 말로(시작표식들("<!-- reborn:skillpack3:triggers:ja v1 -->")[0][1]) === "ja");
  T("[역시험] 말정하기가 강제값을 그대로 따른다",
    말정하기("en") === "en" && 말정하기("ko") === "ko" && 말정하기("ja") === "ja");
  T("[역시험] 말정하기가 모르는 값이면 로케일로 떨어진다", ["ko", "en", "ja"].includes(말정하기("zz")));
  T("★설치 목록이 이 패키지에 박혀 있지 않다 (돈 안 낸 사람이 가져갈 수 없다)",
    !readFileSync(join(여기, "install.mjs"), "utf8").includes("skills\", \"add\","));
  T("★팩3정본을 실행 시점에 읽지 않는다 (npm 에 안 실린다)",
    !/^import[^\n]*팩[23]정본/m.test(readFileSync(join(여기, "install.mjs"), "utf8")));
  T("[역시험] 깔지말까 — 플러그인은 깔지 않는다", 깔지말까({ kind: "plugin" }, false) !== null);
  T("[역시험] 깔지말까 — 선택 칸은 --with-optional 없으면 안 깐다", 깔지말까({ kind: "skill", optional: true }, false) !== null);
  T("[역시험] 깔지말까 — 선택 칸도 --with-optional 이면 깐다", 깔지말까({ kind: "skill", optional: true }, true) === null);
  T("[역시험] 깔지말까 — 보통 스킬은 깐다", 깔지말까({ kind: "skill" }, false) === null);
  T("[역시험] 묶음폴더들 — SKILL.md 있는 폴더만 고른다(한 겹 싸인 zip 도)", (() => {
    const d = mkdtempSync(join(tmpdir(), "rs3-"));
    try {
      mkdirSync(join(d, "wrap", "a"), { recursive: true }); mkdirSync(join(d, "wrap", "b"), { recursive: true });
      writeFileSync(join(d, "wrap", "a", "SKILL.md"), "---\nname: a\n---");
      return JSON.stringify(묶음폴더들(d)) === JSON.stringify(["a"]);
    } finally { rmSync(d, { recursive: true, force: true }); }
  })());

  T("★★npx 를 실제로 부를 수 있다 (윈도우 EINVAL 재발 방지)", (() => { const r = 돌리기(["--version"], 60000); return r.status === 0 && /\d+\.\d+/.test(String(r.stdout)); })());
  T("[역시험] 따옴 — 빈칸 든 인자는 싼다", 따옴("a b") === '"a b"' && 따옴("pbakaus/impeccable") === "pbakaus/impeccable");
  T("[역시험] 이름뽑기가 빈 글에서 0개", 이름뽑기("").length === 0);
  T("★이름뽑기 — 빈칸 한 칸 뒤 윈도우 경로(묶음에 하나뿐인 스킬)", 이름뽑기("  karpathy-guidelines C:\\Users\\a\\.claude\\skills\\karpathy-guidelines\n").includes("karpathy-guidelines"));
  T("★이름뽑기 — 빈칸 한 칸 뒤 유닉스 경로", 이름뽑기("  humanizer /home/a/.claude/skills/humanizer\n").includes("humanizer"));
  T("[역시험] 이름뽑기가 색 코드를 걷어낸 뒤 잡는다", 이름뽑기("\x1b[36mhumanizer\x1b[0m   /x\n").includes("humanizer"));
  T("[역시험] 없는 스킬은 파일로있나가 false", 파일로있나("이런스킬은없다-xyz") === false);
  T("[역시험] 상태()가 둘 다 없으면 '없음'", 상태({ skill: "없다-xyz" }, { 이름들: [] }).급 === "없음");
  T("[역시험] 상태()가 목록에만 있으면 '반쪽'", 상태({ skill: "없다-xyz" }, { 이름들: ["없다-xyz"] }).급 === "반쪽");
  T("[역시험] 상태()가 alt 이름으로도 잡는다",
    상태({ skill: "없다-xyz", alt: ["또있다-xyz"] }, { 이름들: ["또있다-xyz"] }).급 === "반쪽");
  T("[역시험] 토큰뽑기 — 맨 형태(옛 메일에 박힌 줄)", 토큰뽑기(["q6jgc6sgnb"]) === "q6jgc6sgnb");
  T("[역시험] 토큰뽑기 — --token= 형태", 토큰뽑기(["--token=abc23456"]) === "abc23456");
  T("[역시험] 토큰뽑기 — 환경변수", 토큰뽑기([], { REBORN_SKILLPACK_TOKEN: "zz234567" }) === "zz234567");
  T("[역시험] 토큰뽑기 — --check 를 토큰으로 오인하지 않는다", 토큰뽑기(["--check"]) === "");
  T("★진입점 가드가 있다 (import 만으로 설치가 돌면 안 된다)",
    /직접실행[\s\S]{0,400}else await 본체\(\)/.test(readFileSync(join(여기, "install.mjs"), "utf8")));

  줄(`\n  통과 ${통과} · 실패 ${실패}\n`);
  process.exit(실패 ? 1 : 0);
}

/* ── 본체 ─────────────────────────────────────────────────────────────
   ★★진입점 가드. **`import` 만 해도 본체가 돌면 안 된다.**
     이 파일은 함수를 여러 개 export 한다(시험·다른 도구가 불러 쓴다). 가드가 없으면
     불러 읽기만 해도 서버를 두드리고, **토큰이 있으면 실제로 깔고 CLAUDE.md 까지 쓴다.**
     실제로 확인했다 — 가드 넣기 전에는 `import` 한 줄에 안내문이 뜨고 `process.exit(2)` 까지 갔다.
     같은 병으로 예전에 실제 댓글이 발행된 적이 있다 → 진입점 가드는 예외 없이 붙인다. */
const 직접실행 = (() => {
  try { return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]; }
  catch { return false; }
})();
if (!직접실행) { /* 불려 온 것이다. 함수만 내주고 아무것도 하지 않는다. */ }
else await 본체();

async function 본체() {
if (자기시험) 자기시험돌리기();

const 시작 = Date.now();
줄(`\n${c.b}${G.머리}${c[0]}  ${c.d}${G.머리부제}${c[0]}`);

if (!토큰) {
  줄(`\n${c.r}${G.주문번호없음}${c[0]}`);
  if (인자.some((x) => /^https?:\/\//i.test(x))) 줄(`${c.y}${G.주소로착각}${c[0]}`);
  줄(`${c.d}${G.주문번호안내}${c[0]}`);
  줄(`  ${c.cy}${G.주문번호예시}${c[0]}`);
  줄(`${c.d}${G.느낌표안내}${c[0]}!${c.d}${G.느낌표안내뒤}${c[0]}`);
  줄(`${c.d}${G.아직안샀다면(`${c.cy}${착지}${c[0]}`)}\n`);
  process.exit(2);
}

const 답 = await 받아오기(토큰);
if (!답.ok) {
  줄(`\n${c.r}${답.이유 || G.이유못찾음}${c[0]}`);
  줄(`${c.d}${G.막히면(CS)}${c[0]}\n`);
  process.exitCode = 1; return;   // fetch 뒤다 — exit() 로 끊지 않는다(맨 끝 주석)
}

const 스킬들 = Array.isArray(답.skills) ? 답.skills : [];
if (!스킬들.length) {
  줄(`\n${c.r}${G.목록빔(CS)}${c[0]}\n`);
  process.exitCode = 1; return;   // fetch 뒤다 — exit() 로 끊지 않는다(맨 끝 주석)
}

줄(`${c.d}${답.packLabel || G.팩기본이름} · ${G.종수남은설치(스킬들.length, 답.remaining, 답.windowDays)}${c[0]}`);
/* ★고객은 개발자가 아니다(대표 지시 2026-09-05). 「상시비용」「토큰」 같은 말을 쓰지 않는다.
     같은 뜻을 아는 말로 적는다 — 착지 페이지와 같은 말을 써야 헷갈리지 않는다. */
const 상시합 = 스킬들.reduce((a, s) => a + (Number(s.standing) || 0), 0);
if (상시합) 줄(`${c.d}${G.상시자리(원(상시합))}${c[0]}`);
줄("");

const 막힘 = [];
let 된것 = 0, 이미 = 0, 반쪽 = 0;
const 목록 = 설치목록();

/* ★자사 묶음을 **맨 먼저** 받는다 — 서버가 준 주소는 15분짜리인데, 외부 스킬 30여 개를 먼저 깔면
     느린 PC 에서 15분을 넘겨 403 으로 끝난다(2026-09-26 코덱스 교차검수). */
if (답.bundle?.url && !확인만) {
  줄(`${c.b}${G.묶음머리(답.bundle.개수)}${c[0]} ${c.d}${G.묶음부제}${c[0]}`);
  process.stdout.write(G.묶음받는중);
  const 묶음결과 = await 묶음깔기(답.bundle);
  줄(`${묶음결과.ok ? c.g : c.r}${묶음결과.말}${c[0]}\n`);
  if (묶음결과.ok) 된것 += 묶음결과.확인.length;
  else 막힘.push({ 이름: G.묶음실패이름, 말: 묶음결과.말 });
} else if (답.rules === "skillpack3" && !답.bundle && !확인만) {
  줄(`${c.y}${G.묶음못받음}${c[0]}\n`);
  막힘.push({ 이름: G.묶음실패이름, 말: G.묶음못받음사유 });
}

if (!목록.ok) 줄(`${c.y}${G.목록못읽음}${c[0]}\n`);

for (const s of 스킬들) {
  줄(`${c.b}${s.title || s.skill}${c[0]} ${c.d}(${s.repo} · ${s.author || "?"} · ${s.license || "?"})${c[0]}`);
  if (s.ko) 줄(`  ${s.ko}`);
  if (Number(s.standing) > 0) {
    const 무게 = s.weight ? ` · ${s.weight}` : "";
    줄(`  ${c.d}차지하는 자리 ${s.standing}${무게}${s.fired ? ` · ${s.fired}` : ""}${s.quality ? ` · ${s.quality}` : ""}${c[0]}`);
  }
  if (s.note) 줄(`  ${c.y}※ ${s.note}${c[0]}`);
  if (s.needs) 줄(`  ${c.y}※ 준비물: ${s.needs}${c[0]}`);
  if (s.candid) 줄(`  ${c.y}${s.candid}${c[0]}`);

  const 안깜 = 깔지말까(s, 선택도);
  if (안깜) {
    줄(`  ${c.d}${안깜}${c[0]}`);
    if (Array.isArray(s.install) && s.install.length)
      줄(`  ${c.d}${G.직접까실때(`${(s.kind || "skill") === "skill" ? "npx " : ""}${s.install.join(" ")}`)}${c[0]}\n`);
    else 줄("");
    continue;
  }
  const 전 = 상태(s, 목록);
  if (전.급 === "ok") { 줄(`  ${c.g}${G.이미설치됨}${c[0]}\n`); 이미++; 된것++; continue; }
  if (확인만) { 줄(`  ${c.d}${G.확인만안내(전.말)}${c[0]}\n`); continue; }
  if (!Array.isArray(s.install) || !s.install.length) {
    줄(`  ${c.r}${G.설치명령없음}${c[0]}\n`);
    막힘.push({ 이름: s.title || s.skill, 말: "설치 명령 없음" }); continue;
  }

  process.stdout.write(G.깝니다);
  돌리기(["-y", ...s.install]);
  const 후 = 상태(s, 설치목록(true));
  if (후.급 === "ok") { 줄(`${c.g}${G.됐습니다}${c[0]}\n`); 된것++; }
  else {
    if (후.급 === "반쪽") 반쪽++;
    줄(`${c.r}${후.말}${c[0]}`);
    줄(`  ${c.d}${G.손으로(s.install.join(" "))}${c[0]}\n`);
    막힘.push({ 이름: s.title || s.skill, 말: 후.말 });
  }
}

/* ★발동기는 **하나라도 깔렸을 때만** 넣는다. 자기 일도 못 한 설치기가 남긴 파일은 쓰레기다. */
if (!규칙끄기 && 답.rules === "skillpack3" && (된것 > 0 || 확인만)) {
  줄(`${c.b}${G.언제펴라제목}${c[0]} ${c.d}${G.언제펴라부제}${c[0]}`);
  줄(`${c.d}${G.언제펴라설명}${c[0]}`);
  if (확인만) {
    const st = 발동기상태();
    줄(`  ${st.급 === "ok" ? c.g : c.d}${G.확인만발동기(st.말)}${c[0]}\n`);
  } else {
    const 말 = 말정하기(말강제);
    const r = 발동기깔기(process.cwd(), 말);
    줄(`  ${r.급 === "ok" ? c.g : c.r}${r.말}${c[0]}`);
    줄(`  ${c.d}지금 폴더의 CLAUDE.md 입니다. 홈 폴더는 건드리지 않습니다. 빼려면 --no-rules`
      + `${말 === "en" ? " · English (--lang=ko for Korean)"
        : 말 === "ja" ? " · 日本語（韓国語にするには --lang=ko）"
          : " · 영어로 넣으려면 --lang=en · 日本語なら --lang=ja"}${c[0]}\n`);
  }
}

if (막힘.length) {
  줄(`${c.y}${G.막힌것머리(막힘.length)}${c[0]}`);
  for (const m of 막힘) 줄(`  ${m.이름} — ${m.말}`);
  줄(`${c.d}${G.막히면(CS)}${c[0]}`);
}

줄(`${c.b}${G.모션팩머리}${c[0]} ${c.d}${G.모션팩부제}${c[0]}`);
줄(`  ${c.cy}npx --yes reborn-motionpack@latest ${토큰}${c[0]}\n`);
줄(`${c.d}${G.재시작안내}${c[0]}`);
줄(`${c.d}${G.재는법(`${c.cy}${착지}${c[0]}`)}\n`);

if (!확인만 && 답.runId) {
  await 보고({
    runId: String(답.runId), token: 토큰,
    done: 된것 - 이미, already: 이미, half: 반쪽, fail: 막힘.length,
    failedSkills: 막힘.map((m) => m.이름).slice(0, 20),
    durationSec: Math.round((Date.now() - 시작) / 1000),
    nodeMajor: Number(process.versions.node.split(".")[0]),
  });
}

/* ★★process.exit() 로 끊지 않는다 (2026-09-26 종단 시험). 윈도우 노드는 fetch 직후 강제 종료하면
     `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) … async.c` 를 찍고 0xC0000409 로 죽는다 —
     설치는 다 끝났는데 고객 화면 마지막 줄이 오류가 된다. 종료코드만 정하고 저절로 끝나게 둔다. */
process.exitCode = 막힘.length ? 1 : 0;
}
