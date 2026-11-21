# 내 데포르메 — 등록 FBX와 런타임 재사용, 2026-11-04

등록 시 검증한 FBX를 작업용 모델로 보관하고, 이후 포즈 적용은 그 FBX만 읽는다. 원본 CS3C/FBX와 Blender 보존본은 유지한다. 제품 카드 UI는 변경하지 않는다. companion converter는 #142, client는 #159다.

## 저장 계약

NDJSON envelope는 `standin.local-converter/1`, 계약 revision은 **4**다. `hello.modelStorageVersion=personal-fbx/1`, camera는 기존 `personal-camera/1`이다. normalization/converter는 `/4`, importer/rig은 `/2`다. 일반 빌드 gate와 native handshake가 이전 런타임을 거절한다.

```text
personal-body-v1/
  cards/<card-id>.json
  worker/models/<worker-id>/
    original.cs3c 또는 original.fbx  # 원본 바이트 사본
    character.fbx                  # 등록 때 export/reimport 검증한 실행용 모델
    character.blend                # 복구용 보존본, 포즈 작업에서 열지 않음
    preview.glb                    # 검증한 FBX를 재임포트한 장면에서 생성
    manifest.json                  # 각 파일 hash, 원본 정보, 버전, 검증 결과
    results/<snapshot>/result.fbx   # 포즈와 카메라가 확정된 출력 cache
```

`normalizedPath/normalizedHash`는 이제 FBX를 가리키며 `normalizedFormat=fbx`다. 보존본에는 별도 `archivePath/archiveHash`를 기록한다. FBX는 terminal/helper bones와 object transforms를 유지하는 개인 모델 importer로 읽는다. 기본 서버 importer의 leaf 제거 정책을 개인 모델에 적용하지 않는다. 뼈 계층/위치, 메시/재질 영역, 5관절 skin probe roundtrip gate를 통과해야 등록된다.

기존 `/3` 캐시를 새 형식으로 오인해 사용하지 않는다. 이전 등록의 원본/보존본은 그대로 남으며 `/4`용으로 한 번 다시 등록해야 한다. 자동 마이그레이션은 이번 변경에 포함하지 않는다. 모델 삭제는 해당 카드/원본 사본/작업 파일/cache를 지우며 별도 저장한 결과는 유지한다.

## 재사용과 복구

- 앱 managed state에 런타임 host 한 개를 유지한다. capability 조회와 import/apply/export가 같은 app-owned library/root의 프로세스를 공유한다. 기존 `capability/worker` 별도 런타임 시작을 없앴다.
- 전체 패키지 해시는 새 host가 시작될 때마다 검증한다. 검증을 생략하거나 파일을 manifest에서 제외하지 않는다. 같은 검증된 host를 재사용해 이 비용을 작업마다 반복하지 않는다.
- Blender 변환은 계속 작업별 분리 child다. 시간/메모리/취소 제한을 유지한다. 상주 Blender 장면의 데이터가 다음 모델에 섞이도록 바꾸지 않았다.
- 런타임 경로/라이브러리 root 변경, 종료된 프로세스, 요청 수 상한에 도달하면 새 host를 만든다. 오류/취소는 보유 세션을 닫는다. 다음 요청에서 복구하며, 커밋 여부가 불확실한 실패 작업을 자동 재실행하지 않는다.
- 앱 종료에서는 진행 작업 취소 후 stdin EOF로 host/child를 정리한다. 개인 메타데이터와 새 FBX/보존본 경로·hash도 replay 수집에서 제외한다. 기록/동의 기본값은 변경하지 않는다.

## 실측과 검증

실제 packaged runtime을 Rust 어댑터의 동일 `RuntimeCache`에서 실행한 [측정](native-runtime-timing.json)이다. 한 대의 macOS arm64, 허가된 CS3C/BVH 샘플이며 서버 응답·전체 UI 시간·최종 사용자 폴더 쓰기는 포함하지 않는다.

| 단계 | 시간 |
| --- | ---: |
| 최초 host 시작 + 전체 패키지 검증 | 5.997초 |
| 이후 hello IPC | 6.69–6.91ms |
| 원본 CS3C 등록·FBX 검증 | 2.207초 |
| 등록 FBX에서 새 포즈 적용·출력 검증 | 1.679초 |
| 같은 결과 cache 재사용 | 18.82ms |
| 검증한 worker FBX를 지정 검수 경로로 export | 17.49ms |

동일 프로세스 유지와 출력 SHA 일치를 assert했다. 최초 시작 비용은 남으며, 이 수치를 모든 모델/기기의 SLA로 해석하지 않는다.

- Rust 개인 모델 검사 **10 통과**: real packaged 5개(포맷/decoder/취소 및 재사용 실측), authored IPC process로 재사용/오류/프로세스 종료/취소 후 세션 정리와 root 분리 확인.
- 웹 **1,302 통과/1 skip**. 마지막 private metadata 추가 후 실제 rrweb → queue/outbound 압축 payload 집중 검사 **2 통과**. 타입/lint(기존 warning1, error0)/웹 build/Rust clippy 통과.
- converter local **13**, decoder **6**, 일반 runtime packaging gate **1** 통과.
- 원본 CS3C 2종 + FBX 1종 × source/yaw/roll의 실제 출력 9개. 복구 `.blend`를 잠시 다른 이름으로 둔 상태에서도 모두 적용/출력했다. 독립 FBX reimport의 단일 회전, weights/scales 보존 검사를 통과했다.
- 정상 build entry로 새 macOS arm64 debug `.app`를 빌드했다. [증거](evidence.json)에 정확한 runtime manifest pin과 resource 파일 6,579개 변경0을 기록했다. 이번 빌드의 native picker부터 이어지는 UI smoke는 도구의 긴 접근성 응답 지연/`AXError.cannotComplete`로 **미완료**다. 이전 UI 검수와 새 native IPC 검증을 혼동하지 않는다.

## 향후 `.clip`

원본 CS3C는 그대로 보존하는 것이 우선이다. `.blend`는 파싱한 범위의 복구본으로 원본 전체를 대체하지 않는다. `.clip`은 CSP 문서이며, `.cs3c`는 3D 캐릭터 파일이다. 원본/FBX/Blender 보존본을 저장하는 것과 `.clip` 문서 생성 경로는 별개다. 이번 변경은 `.clip` writer나 CSP 자동 조작을 구현하지 않는다.

공식 근거: [CSP 문서 형식](https://help.clip-studio.com/en-us/manual_en/210_file/Open_file.htm), [Modeler 캐릭터 저장](https://www.clip-studio.com/site/gd_en/csm/userguide/csm_userguide/310_character_op/310_character_op_h2_0030.htm). `.clip`의 3D layer/카메라/소재 편집 범위와 실제 생성 방식은 별도 설계·검수가 필요하다.

기본 installer 비활성/manifest pin/releaseReady gate를 유지한다. 기존 CSP import 종료 문제와 live 설치 소유 BFF 연속 검증, 다른 OS 및 서명/재배포 검수는 남아 있다. merge·배포·운영 접속·유료 추론은 수행하지 않는다.
