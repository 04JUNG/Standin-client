# 내 데포르메 — develop 통합 검수, 2026-11-03

이 기록이 이전 2026-10-28/31 QA의 현재 지원 범위 설명보다 우선한다. **기능을 끈 기반 병합과 사용자 기능 활성화/출시는 별개다.** 기능 활성화는 아직 승인하지 않는다.

## 통합 이력과 UI

클라이언트 develop `7b019465337eea6a8758a54c23188c0cb7c0e62a`(리플레이 #160 포함)에 #159 원래 이력, 제품 UI `27b1aea`, 후속 수정을 통합했다. #172 `34af687ed280cfc249e14d13fad5bc1e4ef238a0`의 개별 자동 저장 복원을 **그대로 병합**해 중복 구현/덮어쓰기를 피했다. #172가 먼저 develop에 들어가면 해당 이력은 중복 적용되지 않는다. 부분 저장 확인, 실패한 scene 전제조건의 개별 저장 확인과 통합 기능이 꺼진 작업의 개별 자동 저장을 구분한다.

사용자 UI를 유지한다: 체형 커스텀의 내 데포르메 탭 → 첫 칸 점선 플러스 카드 → 새 파일 입력만 있는 불러오기 창. 기존 카드는 이미지·연필 inline 이름 변경·휴지통 확인 삭제. 앱/바 더보기는 이미지 카드 선택만 제공하고 수치 조절/미제공 설명을 추가하지 않았다. UI의 최종 승인은 사용자에게 있다.

## 방향, immutable identity와 실패 경계

- raw BFF `camera`를 GLB 주소 유무와 무관하게 `presentationCamera`에 보존한다. 기존 `previewModel.rotation`과 함께 검증한다. 알려진 v1/v2, proper 3×3 rotation, 원본 BVH SHA가 맞아야 한다. malformed/다른 source/알 수 없는 카메라는 `CAMERA_UNSUPPORTED`로 차단한다.
- 다운로드는 기존 설치 소유 BFF 최종 BVH export 경로 그대로다. 사용자 모델/이름/경로를 BFF로 보내지 않는다. base BVH는 source SHA를 확인하고 refined BVH는 원본 카메라와 확정 pose SHA를 각각 보존한다. BVH에는 카메라 회전이 bake되지 않는다.
- local IPC envelope는 `standin.local-converter/1`, 계약 revision **3**, camera `personal-camera/1`. apply에는 explicit camera가 필수다. normalization/converter는 `/3`, importer/rig은 `/2`다. 구 런타임은 신형 클라이언트의 capability/apply 검사에서 차단한다.
- solver/원본 스킨은 유지하고 retarget 완료 후 Hips를 중심으로 Y-up 모델 회전을 Blender basis로 변환해 **한 번만** 적용한다. 등록 preview는 원본이다. 최종 preview는 검증한 FBX 바이트를 그대로 표시하며 화면에서 회전을 덧씌우지 않는다.
- 행렬·원본 카메라 SHA·모델/버전/fingerprint·최종 BVH SHA·손·범위를 준비/query/snapshot identity에 포함한다. native는 worker snapshot 전체를 저장 카드/요청과 대조하고 실제 FBX SHA를 확인한다. camera-only 변경에도 기존 준비 결과는 즉시 사라지며 저장 중 query/설치/인물/모델 변경은 쓰기 전에 취소한다. 저장 직전 BVH SHA 재검사도 유지한다.
- 저장 동의 binding에도 인물별 개인 모델 identity를 포함한다. private 이름과 원본 경로는 binding에 넣지 않는다. 모델 교체/삭제 이후 오래된 부분/개별 동의를 재사용하지 않는다.

## 리플레이/분석 수집

전체 제품의 기록/동의 기본값은 바꾸지 않았다. 개인 카드, 이름 label, native 미리보기 wrapper, portal dialog, 저장 완료 체형 이름과 로컬 파일 목록을 private 처리했다. rrweb 옵션은 유지한다. 추가 filter가 **recorder buffer 전** 및 **asset rewrite/queue 전**에 private snapshot/attribute/text/add/input payload를 제거한다. sourcePath/localModelId/sourceHash/원본 이름/바이트 등 local metadata는 generic sanitizer에서도 제거한다. raw private 자산 URL을 큐에 넣기 전 fetch하는 경로도 차단한다.

실제 rrweb recorder + 실제 제품 카드/로컬 저장 파일 목록 + initial snapshot/증분 mutation + 압축/IndexedDB queue + 가짜 HTTP transport 회귀를 실행했다. 제출 직전 payload와 압축 해제한 queued/outbound chunk에 private marker 이름·로컬 경로·파일명·모델 식별자·원본 바이트가 없음을 검사했다. 이는 실제 사용자 데이터를 원격에 보내는 시험이 아니다.

## 일반 installer와 런타임

`npm run tauri -- build ...`와 release wrapper가 동일한 runtime 준비 gate를 사용한다.

- runtime을 지정하지 않은 일반 빌드는 `VITE_PERSONAL_BODY_ENABLED=false`로 고정하며 optional resource config를 합치지 않는다. 개인 기능 활성화를 주장하지 않는다.
- runtime을 지정하면 manifest SHA pin, 대상 OS/명시 target, per-file SHA, camera revision을 검증한 후 resource를 포함하고 frontend를 활성화한다. 이미 복사된 resource도 매번 다시 검증한다.
- universal macOS에 arm64 package를 슬쩍 넣을 수 없다. 현재 검증 대상은 arm64뿐이다. Windows/x64/universal native qualification은 남아 있다.
- `releaseReady:false`는 debug 검수에서만 허용한다. 일반 공개 release 경로에서는 거부한다. 서명/공증·Blender 소스/고지·decoder 재배포 적합성은 별도 출시 gate다.
- 검수 app/DMG는 별도 identifier `app.standin.desktop.personal-review-20261103`로 빌드했다. 기존 사용자 앱 데이터/동의/설정은 건드리지 않았다. 검수 overlay만 updater endpoints를 비워 테스트 앱의 자동 교체를 막았다.

```sh
STANDIN_LOCAL_CONVERTER_PACKAGE=/absolute/reviewed/runtime \
STANDIN_LOCAL_CONVERTER_MANIFEST_SHA256=<reviewed-runtime-manifest-sha256> \
npm run tauri -- build --debug --bundles app,dmg --no-sign
```

디코더 포함/미포함 묶음은 별도로 검사한다. CS3C가 항상 거부되어야 한다는 과거 테스트는 제거하고, 포함 묶음의 원본 import/apply/export 성공과 미포함 묶음의 capability false/구조화된 거절을 나눴다. 모델은 관찰된 catalog-v2 원본 두 종과 허가된 FBX 한 종의 범위다. 임의 CS3C/텍스처/물리 단위 보정/개인 손·부분 출력의 완전 지원을 뜻하지 않는다.

## 실행 증거와 한계

최신 검사: 프런트엔드 **1,302 통과/1 skip**, 런타임 빌드 gate 1 통과, Rust 개인 모델 8 통과(실제 packaged IPC 4개 포함, 50.15초), converter local 11 및 decoder 6 통과. 타입·lint(기존 경고 1/오류 0)·웹 빌드·Windows icon·release notes·Rust clippy 검사를 통과했다. macOS 로컬 Node 26의 webstorage 충돌을 피하려 테스트에 `NODE_OPTIONS=--no-experimental-webstorage`를 사용했다(CI Node 22). Blender child 실행은 sandbox에서 실패해 macOS native 환경으로 다시 검증했다. 구체적인 패키지 SHA·환경·한계는 [evidence](integration-evidence-20261103.json)에 기록한다.

- 원본 CS3C 2종 + 기존 FBX 1종, 같은 BVH에 source/yaw/roll 3가지 실제 packaged IPC apply/export. source·pose·artifact SHA, restart/reuse, cache 분리, invalid camera/stale 거절, 삭제 후 저장 파일 보존을 확인했다.
- 9개 출력 FBX를 Blender에 독립 재임포트해 요청 rigid transform을 본 world 좌표/vertex와 대조했다. 단일 회전, 원래 스킨 가중치 및 오브젝트 scale 보존을 검사했다. 이것은 CSP 수용 검증과 다르다.
- 실제 macOS 앱의 네이티브 file picker → 승인 원본과 동일 hash의 CS3C 및 FBX 입력 → 성공 카드/실제 GLB 표시 → inline rename을 확인했다. 파일 선택 경로 단축을 위해 `/private/tmp`에 byte-identical 검수 사본을 사용했다. 원본을 변환한 FBX로 대체해 CS3C 성공을 주장하지 않았다.
- 앱 resource 자체의 runtime을 Rust 어댑터에서 실행해 FBX 성공/CS3C 포함 성공/미포함 거부/취소 정리를 검사했다.
- 후보 선택/앱↔바/부분·개별 저장/손 회귀는 실제 제품 컴포넌트와 테스트 대역이다. 인증된 live staging BFF까지 연결한 연속 UI E2E는 아직 미완료이며 새 유료 추론/평가를 실행하지 않았다.

### CSP 실측 실패 — 기능 활성화 차단

CSP 5.1.1에서 별도 새 검수 canvas에 `model-0-camera-1.fbx`(CS3C 기반, yaw 적용)를 File → Import → 3D data로 선택했을 때 CSP 프로세스가 종료되었다. macOS crash report는 main thread excessive recursion / `EXC_BAD_ACCESS`, `SIGSEGV`다. **CSP 가져오기 성공으로 보고하지 않는다.** Blender roundtrip 성공을 CSP 호환성으로 확대하지 않는다. 출력 방향의 수학적 일치는 확인했지만 CSP 종료의 원인은 아직 특정하지 못했다. 원본 방향/다른 모델 및 실제 CSP 수용 문제의 독립 검수가 필요하다.

기능을 끈 기반 병합 검토는 가능하지만, CSP 호환·live 설치 소유 BFF 연속 검증·나머지 OS와 release qualification이 끝나기 전 사용자 활성화/출시를 승인할 수 없다. 운영 접속/배포, main/develop 직접 push, PR merge는 수행하지 않는다.
