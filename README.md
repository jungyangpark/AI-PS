# AI-PS (AI-Powered Programming Support)

**AI code autocompletion 기반 프로그래밍 튜터링 시스템**

학생의 코딩 학습 과정을 추적하고, 적절한 수준의 productive struggle을 제공하며, Knowledge Component(KC) 기반 학습 분석을 통해 학생의 proficiency를 평가하는 지능형 프로그래밍 학습 도구입니다.

## 🎯 프로젝트 목표

1. **적응형 AI Autocompletion**: 학생 수준에 맞는 3단계 자동완성 제공 (productive struggle 유도)
2. **세밀한 학습 추적**: ProgSnap2 형식으로 모든 편집 과정 기록
3. **Block 단위 코드 분석**: AST 기반 Code2Block으로 의미 단위 코드 블록 추출
4. **KC 기반 학생 모델링**: 블록-KC 매핑을 통한 학생의 지식 상태(proficiency) 평가
5. **개인화된 학습 지원**: 학생 모델을 기반으로 맞춤형 피드백 및 과제 제공

## 📊 System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    Student's VS Code                           │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │          AI-PS Extension                                 │ │
│  │                                                          │ │
│  │  ┌────────────────┐  ┌──────────────────────────────┐   │ │
│  │  │ Edit Tracker   │  │ InlineCompletionProvider     │   │ │
│  │  │ - keystrokes   │  │ - Level 1/2/3 autocomplete   │   │ │
│  │  │ - pause detect │  │ - enabled after mid pause    │   │ │
│  │  │ - edit grouping│  │ - Claude API integration     │   │ │
│  │  └────────┬───────┘  └──────────┬───────────────────┘   │ │
│  │           │                      │                       │ │
│  │  ┌────────▼──────────┐           │                       │ │
│  │  │ ProgSnap2Writer   │           │                       │ │
│  │  │ - Event logging   │           │                       │ │
│  │  │ - CodeState save  │           │                       │ │
│  │  └────────┬──────────┘           │                       │ │
│  │           │                      │                       │ │
│  │  ┌────────▼──────────────────────▼─────────────────┐    │ │
│  │  │             Log Uploader                        │    │ │
│  │  │        (batch upload every 10s)                 │    │ │
│  │  └────────┬────────────────────────────────────────┘    │ │
│  │           │                                              │ │
│  │  ┌────────▼──────────┐                                  │ │
│  │  │  Submit Button    │  ← 학생이 완성된 코드 제출      │ │
│  │  │  (Status Bar)     │                                  │ │
│  │  └───────────────────┘                                  │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────┬────────────────────────────────────┘
                          │ HTTPS (ngrok / cloud)
                          ▼
┌────────────────────────────────────────────────────────────────┐
│                   Backend Server                               │
│                  (Node.js + Express)                           │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                   API Endpoints                          │ │
│  │                                                          │ │
│  │  POST /api/logs          POST /api/complete             │ │
│  │  - ProgSnap2 events      - Code completion              │ │
│  │                                                          │ │
│  │  POST /api/logs/codestate   POST /api/submit            │ │
│  │  - Code snapshots           - Student submission        │ │
│  │                                                          │ │
│  │  POST /api/chat          GET /api/submit/:id            │ │
│  │  - Chatbot Q&A           - Submission history           │ │
│  └────────┬─────────────────────────┬───────────────────────┘ │
│           │                         │                         │
│           ▼                         ▼                         │
│  ┌────────────────┐        ┌───────────────────────┐         │
│  │ Server Storage │        │   Code2Block Module   │         │
│  │ logs/{id}/     │        │                       │         │
│  │ - MainTable    │        │ ┌───────────────────┐ │         │
│  │ - CodeStates   │        │ │  Python AST       │ │         │
│  │ - submissions  │        │ │  Parser           │ │         │
│  └────────────────┘        │ └─────────┬─────────┘ │         │
│                            │           │           │         │
│                            │ ┌─────────▼─────────┐ │         │
│                            │ │  Block Extractor  │ │         │
│                            │ │  (Rule-based)     │ │         │
│                            │ └─────────┬─────────┘ │         │
│                            │           │           │         │
│                            │ ┌─────────▼─────────┐ │         │
│  ┌──────────────┐          │ │  KC Mapper        │ │         │
│  │  Claude API  │◄─────────┤ │  (11 basic KCs)   │ │         │
│  │  (Haiku)     │          │ └───────────────────┘ │         │
│  └──────────────┘          └───────────────────────┘         │
└────────────────────────────────────────────────────────────────┘
```

## 🧩 핵심 컴포넌트

### 1. Code2Block Module
**목적**: 전체 코드를 의미 있는 블록 단위로 분해하여 학습 분석 수행

- **AST Parser**: Python AST를 이용한 구문 분석
- **Block Extractor**: 규칙 기반으로 의미 단위 블록 추출
  - FunctionDef, IfStatement, ForLoop, WhileLoop, Assignment, FunctionCall 등
- **KC Mapper**: 블록에 Knowledge Component 태깅
  - 11개 기본 KC: `conditional_logic`, `iteration`, `function_definition`, `recursion`, `list_manipulation`, `string_operation`, `arithmetic_operation`, `input_output`, `variable_assignment`, `recursive_thinking`, `boolean_logic`

**사용처**:
- 학생이 코드를 제출할 때 (Submit button)
- Autocompletion code를 생성할 때 (향후 구현)

**출력 예시**:
```json
{
  "blocks": [
    {
      "id": "B0",
      "code": "def factorial(n):",
      "type": "FunctionDef",
      "startLine": 1,
      "endLine": 1,
      "kcs": [
        {"id": "KC_003", "name": "function_definition", "category": "basic"}
      ]
    },
    {
      "id": "B1",
      "code": "if n <= 1:",
      "type": "IfStatement",
      "startLine": 2,
      "endLine": 2,
      "kcs": [
        {"id": "KC_001", "name": "conditional_logic", "category": "basic"}
      ]
    }
  ],
  "summary": {
    "totalBlocks": 4,
    "kcs": ["function_definition", "conditional_logic", "recursion"],
    "complexity": "high"
  }
}
```

### 2. ProgSnap2 Event Logging
**목적**: 학생의 모든 편집 과정을 세밀하게 기록하여 학습 과정 분석

- 키 입력, 편집 이벤트, 코드 상태 변화 추적
- Block별로 로그를 매칭하여 KC에 대한 학생 행동 분석
- 예: "이 학생이 recursion KC에서 얼마나 고민했는가?"

### 3. Adaptive Autocompletion (3 Levels)
**목적**: Productive struggle 제공 - 너무 쉽지도, 어렵지도 않게

| Level | 동작 방식 | 학습 목표 |
|-------|----------|----------|
| **Level 1: Follow-along** | 정확히 따라 타이핑해야 ghost text 유지 | 초보자가 구문을 익히도록 유도 |
| **Level 2: Clear on type** | 타이핑하면 ghost 사라짐 (참고용) | 힌트만 보고 스스로 작성 |
| **Level 3: Tab to accept** | Tab으로 전체 수락 가능 | 생산성 향상 (Copilot 스타일) |

### 4. Student Modeling Pipeline
**목표**: KC별 학생의 proficiency 평가

1. **코드 제출** → Code2Block으로 블록 추출 + KC 태깅
2. **ProgSnap2 로그** → 각 블록에 해당하는 편집 이벤트 매칭
3. **KC Proficiency 평가**:
   - 각 KC에서 학생이 소요한 시간, 실수 횟수, 도움 요청 등 분석
   - 예: `recursion` KC에 30분 소요, 5번 오류 → Low proficiency
4. **개인화**:
   - Proficiency 낮은 KC → 더 많은 연습 문제 제공
   - Proficiency 높은 KC → 난이도 상승 또는 건너뛰기

## 📁 프로젝트 구조

```
programming_tool/
├── code-process-logger/          # VS Code Extension
│   ├── src/
│   │   ├── extension.ts          # Main extension logic
│   │   ├── completionProvider.ts # Level 1/2/3 autocomplete
│   │   ├── editTracker.ts        # Keystroke & pause tracking
│   │   ├── progsnap2.ts          # ProgSnap2 writer
│   │   ├── logUploader.ts        # Server upload
│   │   └── chatbotPanel.ts       # Q&A webview
│   └── package.json
│
├── code-process-server/          # Backend Server
│   ├── src/
│   │   ├── index.ts              # Express server
│   │   ├── routes/
│   │   │   ├── complete.ts       # LLM autocomplete API
│   │   │   ├── logs.ts           # ProgSnap2 log collection
│   │   │   ├── submit.ts         # Code submission & analysis
│   │   │   ├── chat.ts           # Chatbot API
│   │   │   ├── students.ts       # Student management
│   │   │   └── debug.ts          # Debug endpoints
│   │   └── modules/
│   │       └── code2block/
│   │           ├── parser.ts     # Python AST parsing
│   │           ├── extractor.ts  # Block extraction
│   │           ├── kcMapper.ts   # KC mapping
│   │           ├── types.ts      # TypeScript interfaces
│   │           └── index.ts      # Main analyzer
│   ├── logs/                     # Student data storage
│   │   └── {studentId}/
│   │       ├── MainTable.csv     # ProgSnap2 events
│   │       ├── CodeStates/       # Code snapshots
│   │       └── submissions/      # Submitted code + analysis
│   └── package.json
│
└── README.md
```

## 🚀 시작하기

### 1. 서버 시작

```bash
cd code-process-server
npm install
npm run dev
```

서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.

**자동 학생 등록**: 서버 시작 시 기본 테스트 학생(`test_lv1`, `test_lv2`, `test_lv3`)이 자동으로 등록됩니다.

**추가 학생 등록** (필요 시):
```bash
# 단일 학생 등록
curl -X POST http://localhost:3000/api/students/register \
  -H "Content-Type: application/json" \
  -d '{"studentIds": ["student_001"]}'

# 여러 학생 등록
curl -X POST http://localhost:3000/api/students/register \
  -H "Content-Type: application/json" \
  -d '{"studentIds": ["student_001", "student_002", "test_lv1_alice"]}'

# 학생 목록 확인
curl http://localhost:3000/api/students
```

### 2. Extension 설치

```bash
cd code-process-logger
npm install
npm run compile
npx @vscode/vsce package --allow-missing-repository
code --install-extension code-process-logger-0.1.0.vsix
```

### 3. 사용 방법

1. **세션 시작**: `Cmd+Shift+P` → `AI-PS: Start Session`
   - Subject ID 입력 (예: `test_lv1`, `student_001`)
   - Assignment ID 입력 (예: `assignment_01`)
   - Password 입력 (기본값: `1234`)

2. **코딩 시작**: 모든 편집이 자동으로 기록됨
   - 10초 멈추면 → 자동완성 활성화
   - 20초 멈추면 → 멈춘 이유 팝업

3. **Submit 버튼 클릭** (상태 바 왼쪽):
   - 현재 코드가 Code2Block으로 분석됨
   - 블록 수, KC 목록, 복잡도가 표시됨
   - 서버에 제출 기록 저장

4. **세션 종료**: `AI-PS: Stop Session`

### 4. 데이터 확인

**ProgSnap2 로그**:
```bash
code-process-server/logs/{studentId}/MainTable.csv
code-process-server/logs/{studentId}/CodeStates/
```

**제출 기록 (Code2Block 분석 포함)**:
```bash
code-process-server/logs/{studentId}/submissions/{assignmentId}_{timestamp}.json
```

## ⚙️ Extension 설정

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `serverUrl` | `http://localhost:3000` | 백엔드 서버 URL |
| `shortPauseThreshold` | `1000` | 편집 묶음 기준 (ms) |
| `midPauseThreshold` | `10000` | 자동완성 켜지는 시간 (ms) |
| `longPauseThreshold` | `20000` | 멈춘 이유 팝업 시간 (ms) |

## 📊 레벨별 자동완성 동작

### Level 1: Follow-along (따라가기)
- Ghost text와 **정확히 일치하는 문자**를 입력해야 ghost 유지
- 불일치 → ghost 사라짐
- **목적**: 초보자가 구문을 익히도록 강제

### Level 2: Clear on type (타이핑 시 사라짐)
- 어떤 문자든 입력 → ghost 즉시 사라짐
- **목적**: 힌트만 보고 스스로 작성

### Level 3: Tab to accept (Tab으로 수락)
- Tab 키로 ghost 전체 수락
- Level 1처럼 따라 타이핑도 가능
- **목적**: Copilot처럼 생산성 향상

**Level 할당 규칙**:
- Subject ID에 `lv1`, `lv2`, `lv3` 포함 시 해당 레벨
- 기본값: Level 1

## 🌐 외부 접속 설정 (다른 노트북에서 사용)

### ngrok으로 서버 노출

```bash
# 서버를 켜놓은 상태에서
ngrok http 3000
# → https://abc123.ngrok.io
```

### 학생 측 설정

1. `.vsix` 파일 전달 후 설치
2. VS Code 설정에서 서버 URL 변경:
   ```
   "codeProcessLogger.serverUrl": "https://abc123.ngrok.io"
   ```

## 🔬 향후 개발 계획

- [ ] Autocompletion code에도 Code2Block 분석 적용
- [ ] ProgSnap2 로그와 Block 매칭 자동화
- [ ] KC별 proficiency 계산 알고리즘 구현
- [ ] 학생 대시보드 (진도, 취약 KC 시각화)
- [ ] 적응형 레벨 조정 (proficiency 기반 자동 Level 변경)
- [ ] 문제 추천 시스템 (취약 KC 중심)

## 📄 License

MIT

---

**Contact**: jungyang.park@example.com