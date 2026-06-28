# AI-PS

코딩 과정을 ProgSnap2 형식으로 기록하고, LLM 기반 자동완성을 제공하는 VS Code Extension + 백엔드 서버.

## System Architecture

```
+------------------------------------------------------------+
|                    Student's VS Code                       |
|                                                            |
|  +------------------------------------------------------+  |
|  |          AI-PS Extension               |  |
|  |                                                      |  |
|  |  +----------------+  +--------------------------+    |  |
|  |  | Edit Tracker   |  | InlineCompletionProvider |    |  |
|  |  | - keystrokes   |  | - LLM autocomplete       |    |  |
|  |  | - pause detect |  | - enabled after 10s      |    |  |
|  |  | - edit grouping|  |   pause                  |    |  |
|  |  +-------+--------+  +------------+-------------+    |  |
|  |          |                         |                 |  |
|  |  +-------v---------+               |                 |  |
|  |  | ProgSnap2Writer |               |                 |  |
|  |  | (local CSV+     |               |                 |  |
|  |  |  CodeStates)    |               |                 |  |
|  |  +-------+---------+               |                 |  |
|  |          |                         |                 |  |
|  |  +-------v-------------------------v--------------+  |  |
|  |  |             Log Uploader                       |  |  |
|  |  |        (batch upload every 10s)                |  |  |
|  |  +-------------------------+----------------------+  |  |
|  +------------------------------------------------------+  |
+---------------------------|--------------------------------+
                            | HTTPS (ngrok / cloud)
                            v
+-----------------------------------------------------------+
|                   Backend Server                          |
|                  (Node.js + Express)                      |
|                                                           |
|  +-------------------------+  +------------------------+  |
|  | POST /api/logs          |  | POST /api/complete     |  |
|  | - receive event batches |  | - proxy to Claude API  |  |
|  | - save ProgSnap2 CSV    |  | - code completion      |  |
|  |                         |  |                        |  |
|  | POST /api/logs/codestate|  +----------+-------------+  |
|  | - save code snapshots   |             |                |
|  +----------+--------------+             |                |
|             |                            v                |
|             v                  +---------+---------+      |
|    +--------+---------+        |   Claude API      |      |
|    | Server Storage   |        |   (Haiku model)   |      |
|    | logs/{subjectId}/|        +-------------------+      |
|    |   MainTable.csv  |                                   |
|    |   CodeStates/    |                                   |
|    +------------------+                                   |
+-----------------------------------------------------------+
```

## 프로젝트 구조

```
code-process-logger/   # VS Code Extension
code-process-server/   # 백엔드 서버 (LLM 자동완성 + 로그 수집)
```

---

## 1. 내 노트북에서 이용하기

### 서버 시작

```bash
cd code-process-server
npm install
npm run dev
```

### Extension 설치

```bash
cd /Users/mlt351/Desktop/paper_jobs/programming_tool/code-process-logger
npm install
npm run compile
npx @vscode/vsce package --allow-missing-repository
code --install-extension code-process-logger-0.1.0.vsix
```

참고: 서버는 `npm run build` (또는 `npm run dev`로 바로 실행).

### 사용

1. VS Code에서 `Cmd+Shift+P` → `AI-PS: Start Session`
2. Subject ID, Assignment ID 입력
3. 코딩 시작 — 모든 편집이 자동으로 기록됨
4. 10초 멈추면 → 자동완성 켜짐 (상태바 변경)
5. 20초 멈추면 → 멈춘 이유 팝업 (고민/검색/휴식/기타)
6. 끝나면 `AI-PS: Stop Session`

### 로그 저장 위치

- 로컬: 워크스페이스 내 `.code-process-logs/` 폴더
- 서버: `code-process-server/logs/` 폴더

---

## 2. 다른 노트북에서 이용하기 (배포)

### 서버 배포

서버를 외부에서 접근 가능하게 만들어야 합니다.

**방법 A: ngrok (간단, 테스트용)**

```bash
# 서버를 켜놓은 상태에서
ngrok http 3000
# → https://abc123.ngrok.io 같은 URL이 나옴
```

**방법 B: 클라우드 (안정적, 실험용)**

AWS, GCP, Fly.io 등에 `code-process-server`를 배포.

### 학생 측 설정

1. Extension `.vsix` 파일을 학생에게 전달
2. VS Code에서 설치: `Cmd+Shift+P` → `Install from VSIX`
3. 서버 주소 설정: `Cmd+Shift+P` → `Preferences: Open Settings` → `codeProcessLogger.serverUrl`에 서버 URL 입력
   ```
   https://abc123.ngrok.io
   ```
4. `AI-PS: Start Session` → Subject ID 입력 → 코딩 시작

---

## Extension 설정 옵션

| 설정 | 기본값 | 설명 |
|---|---|---|
| `serverUrl` | `http://localhost:3000` | 백엔드 서버 URL |
| `outputDir` | `.code-process-logs` | 로컬 로그 저장 경로 |
| `shortPauseThreshold` | `1000` | 편집 묶음 기준 (ms) |
| `midPauseThreshold` | `10000` | 자동완성 켜지는 시간 (ms) |
| `longPauseThreshold` | `20000` | 멈춘 이유 팝업 시간 (ms) |
| `autoStart` | `false` | 워크스페이스 열 때 자동 시작 |

---

## 레벨별 자동완성 제공 방식
### 공통사항
- **표시**: Ghost text로 커서 뒤에 회색 이탤릭체로 표시

### Level 1: Follow-along (따라가기)
- Ghost text 표시됨
- **Tab**: 일반 indent 동작
- **타이핑 시**:
  - Ghost text와 일치하는 문자 입력 → ghost가 한 글자씩 줄어듦
  - 엔터/tab 등 문자 입력이 아닌 키 → ghost가 해당 문자 입력으로 인해 이동한 커서 뒤에 표시
  - 불일치하는 문자 입력 → ghost 사라짐
- **특징**: 따라 타이핑하도록 유도 (교육적)

### Level 2: Clear on type (타이핑 시 사라짐)
- Ghost text 표시됨
- **Tab**: 일반 indent 동작
- **타이핑 시**: 
  - 엔터/tab 등 문자 입력이 아닌 키 → ghost가 해당 문자 입력으로 인해 이동한 커서 뒤에 표시
  - 어떤 문자든 입력 → ghost 즉시 사라짐
- **특징**: 참고만 하고 직접 타이핑 (힌트)

### Level 3: Tab to accept (Tab으로 수락)
- Ghost text 표시됨
- **Tab**: ghost text 전체를 수락하여 코드에 삽입
- **타이핑 시**:
  - Ghost text와 일치하는 문자 입력 → ghost가 한 글자씩 줄어듦
  - 엔터/tab 등 문자 입력이 아닌 키 → ghost가 해당 문자 입력으로 인해 이동한 커서 뒤에 표시
  - 불일치하는 문자 입력 → ghost 사라짐
- **특징**: Tab으로 빠르게 수락 (생산성, Copilot 스타일)

### Student ID별 Level 할당
- `test_lv1` 또는 ID에 `lv1` 포함 → Level 1
- `test_lv2` 또는 ID에 `lv2` 포함 → Level 2
- `test_lv3` 또는 ID에 `lv3` 포함 → Level 3
- 기타 → Level 1 (기본값)

