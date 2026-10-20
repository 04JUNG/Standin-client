// Windows 코드서명(ADR-011 F). Tauri의 bundle.windows.signCommand가 서명할 파일마다
// 이 스크립트를 부른다: 앱 exe, NSIS 플러그인 DLL, 언인스톨러, 설치 파일.
//
// signCommand는 릴리스 워크플로가 서명 Secrets가 있을 때만 설정 파일로 만들어 넘긴다.
// 그래서 로컬 빌드와 dev 빌드에는 이 스크립트가 끼지 않는다.
//
// 필요한 환경변수
//   ES_USERNAME, ES_PASSWORD, ES_CREDENTIAL_ID, ES_TOTP_SECRET  SSL.com eSigner 자격증명
//   CODESIGNTOOL_DIR   CodeSignTool 압축을 푼 폴더(conf/, jar/가 있는 곳)
//   CODESIGNTOOL_JAVA  java.exe 경로
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const ATTEMPTS = 3;
// eSigner OTP는 30초 단위로 바뀐다. 실패한 시도와 같은 코드로 다시 보내지 않도록 한 주기를 넘겨 기다린다.
const RETRY_DELAY_MS = 31_000;
const SIGN_TIMEOUT_MS = 5 * 60_000;

function fail(message) {
  console.error(`sign-windows: ${message}`);
  process.exit(1);
}

const file = process.argv[2];
if (!file || !existsSync(file)) {
  fail(`usage: node scripts/sign-windows.mjs <file>  (got ${file ?? "nothing"})`);
}

const required = [
  "ES_USERNAME",
  "ES_PASSWORD",
  "ES_CREDENTIAL_ID",
  "ES_TOTP_SECRET",
  "CODESIGNTOOL_DIR",
  "CODESIGNTOOL_JAVA",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  fail(`missing environment variables: ${missing.join(", ")}`);
}

const toolDir = process.env.CODESIGNTOOL_DIR;
const jarDir = path.join(toolDir, "jar");
const jar = readdirSync(jarDir).find((name) => /^code_sign_tool-.+\.jar$/.test(name));
if (!jar) {
  fail(`no code_sign_tool-*.jar in ${jarDir}`);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// CodeSignTool은 실패해도 종료 코드 0을 낼 때가 있다(SSL.com 공식 Action도 출력 문자열로 실패를
// 판정한다). 그래서 종료 코드 대신 Windows가 실제로 서명을 인정하는지로 성공을 판단한다.
function readSignature(target) {
  const script =
    "$s = Get-AuthenticodeSignature -LiteralPath $env:STANDIN_SIGN_TARGET; " +
    "[pscustomobject]@{ status = [string]$s.Status; signer = [string]$s.SignerCertificate.Subject; " +
    "timestamped = [bool]$s.TimeStamperCertificate } | ConvertTo-Json -Compress";
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", env: { ...process.env, STANDIN_SIGN_TARGET: target } },
  );
  if (result.status !== 0) {
    fail(`could not read the signature of ${target}: ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout);
}

function signOnce(outDir) {
  // NSIS creates its PE uninstaller as nst*.tmp. SSL.com selects formats by
  // extension and rejects .tmp even though the bytes are a Windows executable.
  // Sign a private .exe copy, then copy back only after signature verification.
  let input = path.resolve(file);
  if (path.extname(input).toLowerCase() === ".tmp") {
    const inputDir = path.join(outDir, "input");
    mkdirSync(inputDir);
    input = path.join(inputDir, "uninstaller.exe");
    copyFileSync(file, input);
  }
  // 셸을 거치지 않고 인자 배열로 넘긴다. 비밀번호에 특수문자가 있어도 .bat처럼 깨지지 않는다.
  // 출력은 별도 폴더로 받는다. 입력 파일 덮어쓰기는 CodeSignTool이 확인을 물어 CI에서 멈춘다.
  const result = spawnSync(
    process.env.CODESIGNTOOL_JAVA,
    [
      "-jar",
      path.join(jarDir, jar),
      "sign",
      `-username=${process.env.ES_USERNAME}`,
      `-password=${process.env.ES_PASSWORD}`,
      `-credential_id=${process.env.ES_CREDENTIAL_ID}`,
      `-totp_secret=${process.env.ES_TOTP_SECRET}`,
      `-input_file_path=${input}`,
      `-output_dir_path=${outDir}`,
    ],
    // conf/code_sign_tool.properties를 작업 디렉터리 기준으로 읽는다.
    { cwd: toolDir, encoding: "utf8", timeout: SIGN_TIMEOUT_MS },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (output) console.log(output);
  if (result.error) console.error(`sign-windows: ${result.error.message}`);

  const signed = path.join(outDir, path.basename(input));
  if (!existsSync(signed)) return false;

  const signature = readSignature(signed);
  if (signature.status !== "Valid" || !signature.timestamped) {
    console.error(
      `sign-windows: signature not accepted (status=${signature.status}, timestamped=${signature.timestamped})`,
    );
    return false;
  }
  copyFileSync(signed, file);
  console.log(`sign-windows: signed ${path.basename(file)} as ${signature.signer}`);
  return true;
}

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  const outDir = mkdtempSync(path.join(process.env.RUNNER_TEMP ?? tmpdir(), "esigner-"));
  let signed = false;
  try {
    signed = signOnce(outDir);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
  if (signed) process.exit(0);
  if (attempt < ATTEMPTS) {
    console.error(`sign-windows: attempt ${attempt} failed for ${path.basename(file)}; retrying`);
    sleep(RETRY_DELAY_MS);
  }
}
fail(`could not sign ${file} after ${ATTEMPTS} attempts`);
