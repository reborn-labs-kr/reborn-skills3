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
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, cpSync, rmSync, statSync } from "node:fs";
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
  return (a.find((x) => !x.startsWith("--")) || env.REBORN_SKILLPACK_TOKEN || "").trim();
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

/**
 * 어느 말로 넣을까. (2026-09-20 · 영어권 1차 · 인계 §H)
 *
 * ★**고객 컴퓨터의 로케일이 곧 그 사람이 읽는 말이다.** 서버에 묻지 않는 이유는
 *   토큰 발급·검증(`skillpack-verify`)에 국경이 없기 때문이다 — 그쪽은 고치지 않는다(인계 §C).
 * ★못 읽으면 한국어로 떨어진다. 지금 사는 사람의 절대다수가 한국 고객이라,
 *   판정이 실패했을 때 덜 틀리는 쪽이 그쪽이다.
 */
export function 말정하기(강제) {
  if (강제 === "en" || 강제 === "ko") return 강제;
  try {
    return /^ko\b/i.test(Intl.DateTimeFormat().resolvedOptions().locale || "") ? "ko" : "en";
  } catch { return "ko"; }
}

export function 발동기상태(폴더 = process.cwd()) {
  const 파일 = join(폴더, "CLAUDE.md");
  if (!existsSync(파일)) return { 급: "없음", 말: "CLAUDE.md 가 아직 없습니다", 파일 };
  const 글 = readFileSync(파일, "utf8");
  /* ★두 표식 중 **하나라도** 있으면 들어 있는 것으로 본다.
     한 벌만 봤다가는 말을 바꿔 다시 깔 때 같은 내용이 두 언어로 들어가고,
     그건 고객의 매 대화에 두 번 실린다 — 우리가 팔려던 것의 정반대다. */
  return (글.includes(표식) || 글.includes(표식_en))
    ? { 급: "ok", 말: "이미 들어 있습니다", 파일 }
    : { 급: "없음", 말: "CLAUDE.md 는 있는데 발동기는 아직 없습니다", 파일 };
}

export function 발동기깔기(폴더 = process.cwd(), 말 = 말정하기()) {
  const 이름 = 말 === "en" ? "발동기3.en.md" : "발동기3.md";
  const 원본 = join(여기, 이름);
  if (!existsSync(원본)) return { 급: "실패", 말: `${이름} 가 옆에 없습니다 — 고객센터로 알려 주세요` };
  const st = 발동기상태(폴더);
  if (st.급 === "ok") return { 급: "ok", 말: "이미 들어 있어 건드리지 않았습니다" };
  const 있던것 = existsSync(st.파일);
  const 기존 = 있던것 ? readFileSync(st.파일, "utf8") : "";
  writeFileSync(st.파일, (있던것 && 기존.trim() ? 기존.replace(/\s*$/, "") + "\n\n---\n\n" : "") + readFileSync(원본, "utf8"), "utf8");
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

/** 자사 스킬 zip 을 받아 ~/.claude/skills 에 푼다. ★우리 폴더 이름만 덮는다 — 남의 스킬은 안 건드린다. */
async function 묶음깔기(묶음) {
  const 임시 = mkdtempSync(join(tmpdir(), "reborn-skills3-"));
  try {
    const r = await fetch(묶음.url);
    if (!r.ok) return { ok: false, 말: `묶음을 받지 못했습니다(${r.status}). 다시 돌리시면 새 주소로 받습니다.` };
    const zip = join(임시, "bundle.zip");
    writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    const 풀곳 = join(임시, "x");
    mkdirSync(풀곳, { recursive: true });
    const 풀기 = process.platform === "win32"
      ? spawnSync("powershell", ["-NoProfile", "-Command",
          `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${풀곳}' -Force`], { encoding: "utf8", windowsHide: true })
      : spawnSync("unzip", ["-o", "-q", zip, "-d", 풀곳], { encoding: "utf8" });
    if (풀기.status !== 0) return { ok: false, 말: "묶음을 풀지 못했습니다. 화면을 캡처해 보내 주세요." };
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
  T("★두 표식이 서로 다르다 (한 벌만 보면 두 언어가 겹쳐 들어간다)", 표식 !== 표식_en);
  T("[역시험] 말정하기가 강제값을 그대로 따른다", 말정하기("en") === "en" && 말정하기("ko") === "ko");
  T("[역시험] 말정하기가 모르는 값이면 로케일로 떨어진다", ["ko", "en"].includes(말정하기("zz")));
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
줄(`\n${c.b}스킬팩3 — SNS 올인원${c[0]}  ${c.d}홈페이지·이미지·영상·SNS 운영·아끼기·교차검수 (스킬팩2 포함)${c[0]}`);

if (!토큰) {
  줄(`\n${c.r}주문번호가 없습니다.${c[0]}`);
  줄(`${c.d}결제 완료 화면(또는 메일)의 명령을 그대로 붙여넣어 주세요. 이런 모양입니다 —${c[0]}`);
  줄(`  ${c.cy}npx --yes reborn-skills3@latest <주문번호>${c[0]}`);
  줄(`${c.d}클로드 코드 안에서는 맨 앞에 ${c[0]}!${c.d} 를 붙이세요.${c[0]}`);
  줄(`${c.d}아직 안 사셨다면 → ${c[0]}${c.cy}${착지}${c[0]}\n`);
  process.exit(2);
}

const 답 = await 받아오기(토큰);
if (!답.ok) {
  줄(`\n${c.r}${답.이유 || "주문번호를 확인하지 못했습니다."}${c[0]}`);
  줄(`${c.d}막히시면 화면을 그대로 캡처해 보내 주세요 — ${CS}${c[0]}\n`);
  process.exitCode = 1; return;   // fetch 뒤다 — exit() 로 끊지 않는다(맨 끝 주석)
}

const 스킬들 = Array.isArray(답.skills) ? 답.skills : [];
if (!스킬들.length) {
  줄(`\n${c.r}받을 스킬 목록이 비어 있습니다. 고객센터로 알려 주세요 — ${CS}${c[0]}\n`);
  process.exitCode = 1; return;   // fetch 뒤다 — exit() 로 끊지 않는다(맨 끝 주석)
}

줄(`${c.d}${답.packLabel || "스킬팩3"} · ${스킬들.length}종 · 남은 설치 ${답.remaining}회 (${답.windowDays}일 기준)${c[0]}`);
/* ★고객은 개발자가 아니다(대표 지시 2026-09-05). 「상시비용」「토큰」 같은 말을 쓰지 않는다.
     같은 뜻을 아는 말로 적는다 — 착지 페이지와 같은 말을 써야 헷갈리지 않는다. */
const 상시합 = 스킬들.reduce((a, s) => a + (Number(s.standing) || 0), 0);
if (상시합) 줄(`${c.d}안 쓰는 날에도 차지하는 자리 ${c[0]}${원(상시합)}${c.d} — 저희가 하나씩 직접 잰 값입니다.${c[0]}`);
줄("");

const 막힘 = [];
let 된것 = 0, 이미 = 0, 반쪽 = 0;
const 목록 = 설치목록();
if (!목록.ok) 줄(`${c.y}※ skills 목록을 못 읽었습니다. 파일 쪽만 보고 판정합니다.${c[0]}\n`);

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
      줄(`  ${c.d}직접 까실 때: ${c[0]}${(s.kind || "skill") === "skill" ? "npx " : ""}${s.install.join(" ")}\n`);
    else 줄("");
    continue;
  }
  const 전 = 상태(s, 목록);
  if (전.급 === "ok") { 줄(`  ${c.g}이미 설치돼 있습니다.${c[0]}\n`); 이미++; 된것++; continue; }
  if (확인만) { 줄(`  ${c.d}${전.말} (--check 라 설치하지 않았습니다)${c[0]}\n`); continue; }
  if (!Array.isArray(s.install) || !s.install.length) {
    줄(`  ${c.r}설치 명령이 오지 않았습니다. 고객센터로 알려 주세요.${c[0]}\n`);
    막힘.push({ 이름: s.title || s.skill, 말: "설치 명령 없음" }); continue;
  }

  process.stdout.write(`  깝니다 … `);
  돌리기(["-y", ...s.install]);
  const 후 = 상태(s, 설치목록(true));
  if (후.급 === "ok") { 줄(`${c.g}됐습니다${c[0]}\n`); 된것++; }
  else {
    if (후.급 === "반쪽") 반쪽++;
    줄(`${c.r}${후.말}${c[0]}`);
    줄(`  ${c.d}손으로: npx ${s.install.join(" ")}${c[0]}\n`);
    막힘.push({ 이름: s.title || s.skill, 말: 후.말 });
  }
}

/* ── 자사 스킬 묶음 ── */
if (답.bundle?.url && !확인만) {
  줄(`${c.b}저희가 만든 스킬 ${답.bundle.개수 || ""}가지${c[0]} ${c.d}— 여러 스킬을 한 명령으로 이어 주는 지휘 스킬 · 한국 SNS 규격 · 아끼기 규칙${c[0]}`);
  process.stdout.write("  받아서 풉니다 … ");
  const 묶음결과 = await 묶음깔기(답.bundle);
  줄(`${묶음결과.ok ? c.g : c.r}${묶음결과.말}${c[0]}\n`);
  if (묶음결과.ok) 된것 += 묶음결과.확인.length;
  else 막힘.push({ 이름: "저희가 만든 스킬 묶음", 말: 묶음결과.말 });
} else if (답.rules === "skillpack3" && !답.bundle && !확인만) {
  줄(`${c.y}※ 저희가 만든 스킬 묶음을 이번에 받지 못했습니다. 잠시 뒤 같은 명령을 다시 돌려 주세요.${c[0]}\n`);
  막힘.push({ 이름: "저희가 만든 스킬 묶음", 말: "서버가 주소를 주지 못함" });
}

/* ★발동기는 **하나라도 깔렸을 때만** 넣는다. 자기 일도 못 한 설치기가 남긴 파일은 쓰레기다. */
if (!규칙끄기 && 답.rules === "skillpack3" && (된것 > 0 || 확인만)) {
  줄(`${c.b}«언제 펴라» 쪽지${c[0]} ${c.d}— 깔아 둔 설명서를 AI 가 실제로 펴 보게 만듭니다${c[0]}`);
  줄(`${c.d}저희가 재 봤을 때 이 중 다섯은 3번 내내 한 번도 안 불렸습니다. 이 쪽지를 넣자 3번 다 불렸습니다.${c[0]}`);
  if (확인만) {
    const st = 발동기상태();
    줄(`  ${st.급 === "ok" ? c.g : c.d}${st.말}${c[0]} ${c.d}(--check 라 건드리지 않았습니다)${c[0]}\n`);
  } else {
    const 말 = 말정하기(말강제);
    const r = 발동기깔기(process.cwd(), 말);
    줄(`  ${r.급 === "ok" ? c.g : c.r}${r.말}${c[0]}`);
    줄(`  ${c.d}지금 폴더의 CLAUDE.md 입니다. 홈 폴더는 건드리지 않습니다. 빼려면 --no-rules`
      + `${말 === "en" ? " · English (--lang=ko for Korean)" : " · 영어로 넣으려면 --lang=en"}${c[0]}\n`);
  }
}

if (막힘.length) {
  줄(`${c.y}막힌 것 ${막힘.length}개${c[0]}`);
  for (const m of 막힘) 줄(`  ${m.이름} — ${m.말}`);
  줄(`${c.d}화면을 그대로 캡처해 보내 주세요 — ${CS}${c[0]}`);
}

줄(`${c.b}움직임 부품 140가지${c[0]} ${c.d}— 같은 주문번호로 따로 받습니다(영상 파일로 뽑으려면 ffmpeg 필요)${c[0]}`);
줄(`  ${c.cy}npx --yes reborn-motionpack@latest ${토큰}${c[0]}\n`);
줄(`${c.d}★다 깐 다음 클로드 코드를 껐다 켜셔야 적용됩니다. 그다음 «이번 주 콘텐츠 짜줘» 라고 말해 보세요.${c[0]}`);
줄(`${c.d}재는 법과 원자료는 여기에 적어 두었습니다 — ${c[0]}${c.cy}${착지}${c[0]}\n`);

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
