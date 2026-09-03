import type { TourStep } from "./resolveActiveStep";

/**
 * 투어 스텝 정의(docs/03 §1 사용자 흐름 순서 그대로).
 *
 * 문구 규칙(CLAUDE.md §6, docs/03 §8):
 * - 처리 시간이나 진행률을 약속하지 않는다.
 * - 후보를 앱이 고른다고 말하지 않는다.
 * - 클립스튜디오에 "전달됐다"고 말하지 않는다. 드래그가 끝난 것은 상대 앱이 받았다는
 *   증거가 아니다 — 확인을 부탁한다.
 * - 작업 기록은 아직 동작하지 않으므로 안내하지 않는다.
 */

const isHome = (p: string) => p === "/app/home";
const isPreview = (p: string) => p === "/app/preview";
const isJob = (p: string) => /^\/app\/jobs\/[^/]+$/.test(p);
const isReview = (p: string) => /^\/app\/jobs\/[^/]+\/review$/.test(p);
const isSave = (p: string) => /^\/app\/jobs\/[^/]+\/save$/.test(p);

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    anchors: [],
    title: "Standin 사용법을 함께 볼까요?",
    body: "러프 콘티나 화면 캡처를 넣으면 가까운 3D 포즈 후보를 찾아 드립니다. 한 장면을 끝까지 저장해 보면서 흐름을 익혀 보세요.",
    match: (ctx) => isHome(ctx.pathname),
  },
  {
    id: "sidebar",
    anchors: ["shell.sidebar"],
    title: "여기서 화면을 옮깁니다",
    body: "홈에서 장면을 넣고, 설정에서 저장 폴더와 단축키를 바꿉니다. 이 튜토리얼도 설정에서 다시 볼 수 있어요.",
    match: (ctx) => isHome(ctx.pathname),
  },
  {
    id: "upload",
    anchors: ["home.dropzone"],
    title: "파일로 넣기",
    body: "콘티 이미지를 이 영역에 끌어다 놓거나, 눌러서 파일을 고릅니다.",
    match: (ctx) => isHome(ctx.pathname),
  },
  {
    id: "capture",
    anchors: ["home.capture"],
    title: "화면에서 바로 잘라 넣기",
    body: "다른 프로그램에 그려 둔 러프를 파일로 저장하지 않고 바로 쓸 수 있습니다. 영역을 드래그하면 그 부분만 입력이 됩니다.",
    match: (ctx) => isHome(ctx.pathname),
  },
  {
    id: "input",
    anchors: ["home.dropzone", "home.capture"],
    title: "직접 한 번 넣어 보세요",
    body: "파일과 화면 캡처 중 편한 쪽으로 장면 하나를 넣어 주세요. 어느 쪽이든 다음 단계는 같습니다.",
    action: "파일을 놓거나 화면 캡처를 시작하면 다음으로 넘어갑니다.",
    match: (ctx) => isHome(ctx.pathname),
    // 홈을 벗어났는지까지 본다. 사이드바로 홈에 돌아오면 앞서 넣은 입력이 남아 있지만
    // 홈에는 그 입력으로 돌아갈 길이 없다 — 이때 '이미 넣었다'고 판정하면 투어가 아무
    // 스텝도 못 찾고 조용히 사라진다. 다시 넣어 달라고 하는 편이 맞다.
    done: (ctx) => ctx.hasDraft && !isHome(ctx.pathname),
  },
  {
    id: "analyze",
    anchors: ["preview.analyze"],
    title: "넣은 장면을 확인하고 분석을 시작합니다",
    body: "원본은 그대로 두고 이 입력만 분석합니다. 다른 장면을 쓰고 싶으면 '다시 선택'으로 돌아가세요.",
    action: "'분석 시작'을 눌러 주세요.",
    match: (ctx) => isPreview(ctx.pathname),
    done: (ctx) => isJob(ctx.pathname) || isReview(ctx.pathname) || isSave(ctx.pathname),
  },
  {
    id: "waiting",
    anchors: ["jobs.pending"],
    title: "분석 중입니다",
    body: "장면을 확인하고 가까운 포즈를 찾는 중입니다. 시간이 걸릴 수 있으니 창을 닫지 말고 기다려 주세요. 기다리는 동안 플로팅 바로 바꿔 다른 작업을 해도 됩니다.",
    action: "후보가 준비되면 다음으로 넘어갑니다.",
    match: (ctx) => ctx.hasAnchor("jobs.pending"),
    done: (ctx) => !ctx.hasAnchor("jobs.pending"),
  },
  {
    id: "failed",
    anchors: ["jobs.error"],
    terminal: true,
    title: "이번 분석은 끝내지 못했습니다",
    body: "튜토리얼은 여기서 마칠게요. 화면의 안내대로 다시 시도하거나 홈으로 돌아갈 수 있고, 설정에서 튜토리얼을 언제든 다시 볼 수 있습니다.",
    match: (ctx) => ctx.hasAnchor("jobs.error"),
  },
  {
    id: "choose",
    anchors: ["jobs.candidates"],
    title: "가까운 포즈 후보입니다",
    body: "앱이 자동으로 정하지 않습니다. 인물마다 후보를 직접 골라 주세요. 고른 뒤에도 보정이 필요할 수 있습니다.",
    action: "인물마다 후보를 하나씩 고르면 다음으로 넘어갑니다.",
    match: (ctx) => ctx.hasAnchor("jobs.candidates"),
    done: (ctx) => ctx.isAnchorEnabled("jobs.confirm"),
  },
  {
    id: "confirm",
    anchors: ["jobs.confirm"],
    title: "고른 포즈로 넘어갑니다",
    body: "마음에 드는 후보가 없으면 '다른 후보 찾기'로 다시 검색할 수 있습니다.",
    action: "'이 포즈 사용하기'를 눌러 주세요.",
    match: (ctx) => ctx.hasAnchor("jobs.candidates"),
    done: (ctx) => isReview(ctx.pathname) || isSave(ctx.pathname),
  },
  {
    id: "review",
    anchors: ["review.confirm"],
    title: "저장 직전에 한 번 확인합니다",
    body: "다음 화면에 들어가면 바로 저장되므로, 무엇이 저장되는지 여기서 확인하세요. 후보를 다시 고르려면 왼쪽 버튼으로 돌아갑니다.",
    action: "'이 포즈로 저장'을 눌러 주세요.",
    match: (ctx) => isReview(ctx.pathname) && ctx.hasAnchor("review.confirm"),
    done: (ctx) => isSave(ctx.pathname),
  },
  {
    id: "savefailed",
    anchors: ["save.error"],
    terminal: true,
    title: "저장하지 못했습니다",
    body: "튜토리얼은 여기서 마칠게요. 화면의 안내대로 다시 저장하거나 다른 폴더를 고를 수 있고, 설정에서 튜토리얼을 언제든 다시 볼 수 있습니다.",
    match: (ctx) => ctx.hasAnchor("save.error"),
  },
  {
    id: "saved",
    anchors: ["save.files"],
    title: "저장 버튼은 없습니다",
    body: "이 화면에 들어온 순간 설정한 폴더에 이미 저장됐습니다. 이 파일을 클립스튜디오 캔버스로 끌어놓으면 데생 인형이 만들어집니다. 끌어놓은 뒤에는 반영됐는지 확인해 주세요.",
    match: (ctx) => ctx.hasAnchor("save.files"),
  },
  {
    id: "finish",
    anchors: ["save.newScene"],
    title: "여기까지가 한 장면입니다",
    body: "다음 장면은 여기서 바로 시작할 수 있습니다. 튜토리얼은 설정에서 언제든 다시 볼 수 있어요.",
    match: (ctx) => ctx.hasAnchor("save.files"),
  },
];
