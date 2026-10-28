import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { OutlineThicknessControl } from "../../src/features/pose-viewer/outline/OutlineThicknessControl";
import {
  PersonOutlineSettings,
  OUTLINE_SAMPLES,
} from "../../src/features/pose-viewer/outline/outlineSettings";
import { OutlineViewer, initialChoice, type Choice } from "./viewer";
import "./style.css";

const labels = ["없음", "얇음", "중간", "두꺼움"];
export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<OutlineViewer>();
  const settings = useRef(new PersonOutlineSettings());
  const [choice, setChoice] = useState<Choice>(initialChoice);
  const [person, setPerson] = useState(0);
  const [width, setWidth] = useState(0);
  const [images, setImages] = useState<string[]>([]);
  const [status, setStatus] = useState("실제 모델 불러오는 중");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const live = new OutlineViewer(canvas.current!);
    viewer.current = live;
    Object.assign(window, { outlinePreview: { viewer: live, settings: settings.current } });
    return () => {
      live.dispose();
      viewer.current = undefined;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setStatus("모델·스킨 불러오는 중");
    viewer
      .current!.setChoice(choice)
      .then(() => {
        if (cancelled) return;
        setImages(viewer.current!.compare());
        setStatus("실제 3D 렌더 · 로컬 프리뷰");
        setReady(true);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setStatus(`불러오지 못했습니다: ${e.message}`);
        viewer.current!.diagnostics.errors.push(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [choice]);
  const changeWidth = (value: number) => {
    settings.current.set(person, value);
    setWidth(settings.current.get(person));
    viewer.current!.setWidth(settings.current.get(person));
  };
  const select = (key: keyof Choice, label: string, values: [string, string][]) => (
    <label className="select-label">
      {label}
      <select
        aria-label={label}
        value={choice[key]}
        onChange={(e) => setChoice({ ...choice, [key]: e.target.value })}
      >
        {values.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <main>
      <header>
        <div className="wordmark">
          STANDIN <span>RENDER LAB / 01</span>
        </div>
        <span className="badge">검수 초안 · 내보내기와 별도</span>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">BODY OUTLINE STUDY</p>
          <h1>외곽선 두께</h1>
          <p>슬라이더를 오른쪽으로 움직이면 인체 바깥 테두리만 두꺼워집니다.</p>
        </div>
        <div className="rule">
          <span>BLACK</span>
          <strong>#000000</strong>
          <span>ALPHA</span>
          <strong>100% 고정</strong>
        </div>
      </section>
      <section className="workspace">
        <div className="stage">
          <div className="stage-label">
            <span role="status">{status}</span>
            <span>회전: 드래그 / 확대: 휠</span>
          </div>
          <canvas ref={canvas} aria-label="실제 인체 외곽선 미리보기" />
          <div className="stage-footer">
            <span>
              {choice.model === "male" ? "남성" : "여성"} · {width.toFixed(2)} px
            </span>
            <button onClick={() => viewer.current!.frame()}>시점 초기화</button>
          </div>
        </div>
        <aside>
          <div className="panel-title">
            선택한 인물 <span>독립 설정</span>
          </div>
          <div className="person-buttons">
            {[0, 1].map((index) => (
              <button
                key={index}
                aria-pressed={person === index}
                onClick={() => {
                  setPerson(index);
                  setWidth(settings.current.get(index));
                  viewer.current!.setWidth(settings.current.get(index));
                }}
              >
                인물 {index + 1}
              </button>
            ))}
          </div>
          <OutlineThicknessControl value={width} onChange={changeWidth} />
          <p className="note">
            0은 완전히 꺼집니다. 최대 2 px는 이 검수 모델을 기준으로 정한 제안값입니다.
          </p>
          <hr />
          {select("model", "모델", [
            ["male", "남성"],
            ["female", "여성"],
          ])}
          {select("pose", "포즈", [
            ["standing", "기립"],
            ["bent", "팔꿈치 굽힘"],
            ["seated", "앉기"],
            ["broader", "체형 변형 표면"],
            ["rig", "리그 변형 추종 실험"],
          ])}
          {select("skin", "스킨", [
            ["default", "기존 기본 재질"],
            ["gray-guide", "회색 + 중심·구조선 시안"],
            ["flesh", "살색 시안"],
            ["flesh-guide", "살색 + 중심·구조선 시안"],
            ["muscle", "근육선 강조 시안"],
          ])}
          {select("angle", "시점", [
            ["front", "정면"],
            ["quarter", "45도"],
            ["side", "측면"],
            ["back", "후면"],
          ])}
          {select("detail", "확대 검수", [
            ["full", "전신"],
            ["face", "얼굴"],
            ["hand", "손가락 (기립 권장)"],
          ])}
          <p className="note">
            같은 인물은 모델·포즈·스킨을 바꿔도 두께가 유지됩니다. 새 작업은 모든 인물이 0으로
            시작합니다.
          </p>
          <button
            className="quiet"
            onClick={() => {
              settings.current.clear();
              setWidth(0);
              viewer.current!.setWidth(0);
            }}
          >
            새 작업 · 두께 초기화
          </button>
        </aside>
      </section>
      <section className="comparison">
        <div className="comparison-title">
          <div>
            <p className="eyebrow">SAME MODEL / POSE / LIGHT / CAMERA</p>
            <h2>두께 4단계 비교</h2>
          </div>
          <button disabled={!ready} onClick={() => setImages(viewer.current!.compare())}>
            현재 시점으로 비교 갱신
          </button>
        </div>
        <div className="samples">
          {OUTLINE_SAMPLES.map((sample, index) => (
            <button key={sample} onClick={() => changeWidth(sample)}>
              <div>
                <strong>{labels[index]}</strong>
                <span>{sample.toFixed(2)} px</span>
              </div>
              {images[index] && (
                <img src={images[index]} alt={`${labels[index]} ${sample} 픽셀 외곽선`} />
              )}
            </button>
          ))}
        </div>
      </section>
      <footer>
        <p>
          피부 시안은 별도 스킨 작업의 복사본입니다. 원본 출처·SHA는 assets/snapshot.json 및
          *-source.json에 기록했습니다. 최신 공식 기본형 여부는 별도 확인 중입니다.
        </p>
        <p>
          외곽선은 앱·웹뷰 미리보기 효과입니다. FBX로 자동 수출되지 않으며, CSP 가져오기 보존은
          검증하지 않았습니다.
        </p>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
