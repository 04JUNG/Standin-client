import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SaveCoveragePanel } from "../src/features/export/components/SaveCoveragePanel";
import { Button } from "../src/shared/components/Button";
import type { SaveCoverage } from "../src/features/export/lib/saveCoverage";
import "../src/app/styles/index.css";
import "./preview.css";
const cases = [
  "2/2명 · FBX 1개",
  "후보 없음 · 부분 저장",
  "사용자 제외",
  "통합 불가",
  "CSP 카메라",
  "기록 파일명",
  "분석 시간 초과",
  "장면 준비 시간 초과",
];
export function Preview() {
  const [scenario, setScenario] = useState(
    Number(new URLSearchParams(location.search).get("case") ?? 1),
  );
  const [surface, setSurface] = useState(
    new URLSearchParams(location.search).get("surface") ?? "app",
  );
  const [accepted, setAccepted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retried, setRetried] = useState(false);
  const coverage: SaveCoverage = {
    detected: [0, 1],
    included: [1, 2].includes(scenario) ? [0] : [0, 1],
    omitted: [1, 2].includes(scenario)
      ? [{ personIndex: 1, reason: scenario === 1 ? "no_candidate" : "user_excluded" }]
      : [],
  };
  const timeout = scenario >= 6;
  return (
    <main>
      <header>
        <b>Standin</b>
        <span>저장 흐름 검수</span>
        <em>합성 데이터 · 실제 CSP 가져오기 미검증</em>
      </header>
      <div className="toolbar">
        <div>
          {["app", "bar"].map((x) => (
            <button aria-pressed={surface === x} key={x} onClick={() => setSurface(x)}>
              {x === "app" ? "전체화면" : "플로팅 바"}
            </button>
          ))}
        </div>
        <select
          aria-label="샘플 상태"
          value={scenario}
          onChange={(e) => {
            setScenario(Number(e.target.value));
            setAccepted(false);
            setSaved(false);
            setRetried(false);
          }}
        >
          {cases.map((c, i) => (
            <option value={i} key={c}>
              {i + 1}. {c}
            </option>
          ))}
        </select>
      </div>
      <p className="caption">
        구현한 React 공통 확인 패널을 사용한 UI fixture입니다. 주변 후보 화면은 샘플이며 파일
        생성·저장·재분석은 시뮬레이션입니다.
      </p>
      <div className={surface === "bar" ? "window bar" : "window app"}>
        <div className="title">
          <b>{timeout ? "작업 확인" : "포즈 저장"}</b>
          <span>− □ ×</span>
        </div>
        <div className="content">
          {surface === "app" && !timeout && (
            <aside>
              <div className="rough">
                <span>원본 러프 · fixture</span>
                <svg viewBox="0 0 320 320">
                  <g fill="none" stroke="#59647b" strokeWidth="5" strokeLinecap="round">
                    <circle cx="108" cy="73" r="22" />
                    <path d="M108 95L104 195M104 120L50 162M104 120L166 140M104 195L66 282M104 195L150 270" />
                    <g transform="translate(180 115) scale(.48)">
                      <circle cx="0" cy="0" r="22" />
                      <path d="M0 22L0 122M0 45L-54 90M0 45L62 65M0 122L-38 209M0 122L46 197" />
                    </g>
                  </g>
                </svg>
              </div>
              <div className="cards">
                <div>
                  인물 1<br />
                  <b>선택한 포즈</b>
                </div>
                <div>
                  인물 2<br />
                  <b>
                    {scenario === 1 ? "후보 없음" : scenario === 2 ? "직접 제외" : "선택한 포즈"}
                  </b>
                </div>
              </div>
            </aside>
          )}
          <section>
            {timeout ? (
              <>
                <h2>
                  {scenario === 6 ? "분석 시간이 초과됐어요." : "장면 준비 시간이 초과됐어요."}
                </h2>
                <p>
                  {scenario === 6
                    ? "입력 분석 단계에서 멈췄어요. 잠시 후 다시 시도해 주세요."
                    : "파일을 아직 저장하지 않았어요. 준비 작업은 계속될 수 있어요."}
                </p>
                <Button disabled={retried} onClick={() => setRetried(true)}>
                  {retried ? "다시 확인 중…" : scenario === 6 ? "다시 시도" : "결과 다시 확인"}
                </Button>
                <p>
                  {retried ? "시뮬레이션 요청 1회 · 중복 클릭 차단" : "자동으로 재시도하지 않아요."}
                </p>
              </>
            ) : (
              <>
                <h2>
                  {saved
                    ? "파일을 저장했어요."
                    : scenario === 4
                      ? "CSP에서 구도를 확인해 주세요"
                      : "저장할 인물 확인"}
                </h2>
                <SaveCoveragePanel
                  coverage={coverage}
                  needsPartialConfirmation={[1, 2].includes(scenario) && !accepted}
                  needsIndividualConfirmation={scenario === 3 && !accepted}
                  unavailableReason="이 작업에서는 통합 저장이 꺼져 있어요."
                  confirmPartial={() => setAccepted(true)}
                  confirmIndividual={() => setAccepted(true)}
                  returnToSelection={() => {
                    setAccepted(false);
                    setSaved(false);
                  }}
                  saved={saved || scenario === 4}
                  scene={scenario !== 3}
                />
                {scenario === 5 && (
                  <div className="note">
                    <b>작업 기록 · T001</b>
                    <p>
                      원본 썸네일: T001
                      <br />
                      선택·출력: T001 작업
                      <br />
                      다른 입력 초안: p0718
                    </p>
                    <code>T001_standin_pose_scene.fbx</code>
                    <p>이름이 없으면 현재 작업 번호로 저장해요.</p>
                  </div>
                )}
                {![4, 5].includes(scenario) && (![1, 2, 3].includes(scenario) || accepted) && (
                  <>
                    <p className="note">
                      {scenario === 3
                        ? "인물마다 파일 1개씩 저장해요."
                        : `인물 ${coverage.included.length}명 · FBX 파일 1개`}
                    </p>
                    <Button disabled={saved} onClick={() => setSaved(true)}>
                      {saved ? "저장 완료" : "선택한 포즈 그대로 저장"}
                    </Button>
                  </>
                )}
                {scenario === 4 && (
                  <p className="note">
                    카메라 정보가 있어도 CSP에 자동 적용되지 않아요. 캔버스와 캡처 영역이 확인되기
                    전에는 구도를 임의로 맞추지 않아요.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>
      <footer>
        후보·손·체형 변경 시 이전 확인은 무효가 됩니다. 실제 저장 동작은 회귀 테스트로 별도
        검증합니다.
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
