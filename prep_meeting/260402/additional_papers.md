# AI-PS 프로젝트 추가 논문 추천 목록

본 목록의 논문들은 원 과제 신청서의 참고문헌 [1]-[25]에 포함되지 않은 논문들입니다.
AI-PS (AI 자동완성 기반 생산적 어려움) 프레임워크 프로젝트의 주제/단계별로 정리하였습니다.

---

## 주제 1: CS 교육에서의 생산적 어려움 / 바람직한 어려움

### 1-1. Retrieval-based Teaching Incentivizes Spacing and Improves Grades in Computer Science Education
- **저자:** YeckehZaare, I., Grot, G., Dimovski, I., Pollock, K., & Fox, E.
- **학회:** SIGCSE '22 (Proceedings of the 53rd ACM Technical Symposium on Computer Science Education)
- **연도:** 2022
- **링크:** https://dl.acm.org/doi/abs/10.1145/3478431.3499408
- **핵심 내용:** 바람직한 어려움 원리(간격 효과, 인출 연습)를 CS 교육에 직접 적용한 연구. 간격을 둔 인출 기반 교수법으로 학생들의 성적이 2.36%p 향상됨. 적절한 방식으로 학습을 어렵게 만드는 것이 더 나은 결과를 가져온다는 이론적 기반을 뒷받침함.
- **연관성:** 자동완성을 의도적으로 제공하지 않는 것(인출 연습의 한 형태)이 학습을 향상시킬 수 있다는 AI-PS의 핵심 가설을 직접적으로 뒷받침함.

### 1-2. When Does Scaffolding Provide Too Much Assistance? A Code-Tracing Tutor Investigation
- **저자:** Jennings, J. & Muldner, K.
- **학회:** International Journal of Artificial Intelligence in Education (IJAIED), 31, pp. 784-819
- **연도:** 2021
- **링크:** https://link.springer.com/article/10.1007/s40593-020-00217-z
- **핵심 내용:** 프로그래밍 튜터에서의 최적 난이도 수준을 조사한 연구. 적절한 수준의 비계(scaffolding)가 과도하거나 불충분한 지원보다 우수함. AI-PS 프로젝트의 핵심 문제인 '얼마나 많은 도움이 과도한 것인가'를 직접 다룸.
- **연관성:** 3단계 자동완성 시스템 설계에 핵심적인 논문. 과제 제안서에 언급된 '골디락스 원칙'에 대한 실증적 근거를 제공함.

### 1-3. The Role of Self-Regulation in Programming Problem Solving Process and Success
- **저자:** Loksa, D. & Ko, A.J.
- **학회:** ICER '16 (ACM Conference on International Computing Education Research)
- **연도:** 2016
- **링크:** https://dl.acm.org/doi/10.1145/2960310.2960334
- **핵심 내용:** 자기조절능력은 충분한 프로그래밍 지식이 있을 때만 효과적임. 학습자 상태에 맞게 난이도를 조정하는 것의 중요성을 강조함.
- **연관성:** 생산적 어려움이 적절히 조정되도록 실시간 학습자 모델링(2분기)의 필요성을 뒷받침함.

### 1-4. Parsons Problems and Beyond: Systematic Literature Review and Empirical Study Designs
- **저자:** Ericson, B.J., Denny, P., Prather, J., Duran, R., Hellas, A., Leinonen, J., Miller, C.S., Morrison, B.B., Pearce, J.L., & Rodger, S.H.
- **학회:** ITiCSE-WGR '22 (Working Group Reports on Innovation and Technology in CS Education)
- **연도:** 2022
- **링크:** https://dl.acm.org/doi/10.1145/3571785.3574127
- **핵심 내용:** 적절한 난이도의 프로그래밍 과제를 만드는 메커니즘으로서의 Parsons 문제에 대한 포괄적 리뷰 (코드 읽기와 쓰기 사이의 바람직한 어려움 형태).
- **연관성:** 전체 코드 작성이 너무 어렵고 전체 자동완성이 너무 쉬울 때, AI-PS 시스템의 대안적 인터랙션 모드로 Parsons 문제를 활용할 수 있음.

### 1-5. Developing Novice Programmers' Self-Regulation Skills with Code Replays
- **저자:** Xie, B., Lim, J.O., Pham, P.K.D., Li, M., & Ko, A.J.
- **학회:** ICER '23 (ACM Conference on International Computing Education Research)
- **연도:** 2023
- **링크:** https://dl.acm.org/doi/10.1145/3568813.3600127
- **핵심 내용:** 초보자가 자신의 코딩 과정을 다시 재생하며 반성하고 자기조절하는 Code Replayer를 소개. 학습을 지원하는 메타인지적 어려움을 촉진함.
- **연관성:** 코드 리플레이 데이터가 AI-PS 학습자 모델의 추가 신호가 될 수 있으며, 리플레이 기반 반성이 선택적 자동완성 접근 방식을 보완할 수 있음.

---

## 주제 2: AI 코딩 보조도구와 학습 효과

### 2-1. Generative AI Without Guardrails Can Harm Learning: Evidence from High School Mathematics [우선 읽기 추천]
- **저자:** Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakci, O., & Mariman, R.
- **학회:** PNAS (Proceedings of the National Academy of Sciences), 122(28)
- **연도:** 2025
- **링크:** https://www.pnas.org/doi/10.1073/pnas.2422633122
- **핵심 내용:** 제한 없는 GPT-4 접근 권한을 가진 학생들이 접근 권한이 제거되었을 때 17% 더 낮은 성적을 보인 대규모 RCT 연구. 교육적 가이드레일이 있는 "GPT 튜터"로 피해가 완화됨. AI-PS 접근 방식을 뒷받침하는 가장 강력한 실증적 증거.
- **연관성:** 과제 제안서의 핵심 전제를 직접적으로 검증함. 통제된 AI 지원(AI-PS와 같은)이 왜 필요한지에 대한 강력한 동기 부여로 인용 가능.

### 2-2. Computing Education in the Era of Generative AI
- **저자:** Denny, P., Prather, J., Becker, B.A., Finnie-Ansley, J., Hellas, A., Leinonen, J., Luxton-Reilly, A., Reeves, B.N., Santos, E.A., & Sarsa, S.
- **학회:** Communications of the ACM, 67(2), pp. 56-67
- **연도:** 2024
- **링크:** https://cacm.acm.org/research/computing-education-in-the-era-of-generative-ai/
- **핵심 내용:** 생성형 AI와 CS 교육의 도전과 기회에 대한 포괄적 서베이. 과의존, 기술 퇴화, 평가 재설계 등을 다룸.
- **연관성:** CS 교육 커뮤니티의 생성형 AI에 대한 우려 속에서 AI-PS 프로젝트의 더 넓은 맥락을 제공함.

### 2-3. Generative AI for Programming Education: Benchmarking ChatGPT, GPT-4, and Human Tutors
- **저자:** Phung, T., Padurean, V.-A., Cambronero, J., Gulwani, S., Kohn, T., Majumdar, R., Singla, A., & Soares, G.
- **학회:** ICER '23 (ACM Conference on International Computing Education Research), Vol. 2
- **연도:** 2023
- **링크:** https://dl.acm.org/doi/10.1145/3568812.3603476
- **핵심 내용:** GPT-4가 많은 과제에서 인간 튜터 수준에 근접하지만 채점/피드백에서는 여전히 어려움을 겪음. LLM 기반 교육 지원의 가능성과 한계를 모두 보여줌.
- **연관성:** 2분기의 LLM 기반 의도 파악 및 개념 연계 구성 요소 설계에 참고할 수 있음.

---

## 주제 3: 프로그래밍 학습에서의 지식 추적 / 학습자 모델링

### 3-1. Code-DKT: A Code-based Knowledge Tracing Model for Programming Tasks
- **저자:** Shi, Y., Chi, M., Barnes, T., & Price, T.W.
- **학회:** EDM '22 (International Conference on Educational Data Mining)
- **연도:** 2022
- **링크:** https://educationaldatamining.org/edm2022/proceedings/2022.EDM-long-papers.5/index.html
- **핵심 내용:** code2vec을 활용하여 코드 특징을 추출하고 DKT와 결합하여, 프로그래밍 과제에서 기존 DKT 대비 AUC 3-4% 향상.
- **연관성:** 학습자 지식 상태 모델링 구성 요소에 직접 적용 가능. 실시간 이해도 평가를 위한 코드 특징 표현 방법에 참고가 됨.

### 3-2. srcML-DKT: Enhancing Deep Knowledge Tracing with Robust Code Representations from srcML
- **저자:** Pankiewicz, M., Shi, Y., & Baker, R.S.
- **학회:** EDM '25 (International Conference on Educational Data Mining)
- **연도:** 2025
- **링크:** https://educationaldatamining.org/EDM2025/proceedings/2025.EDM.short-papers.83/index.html
- **핵심 내용:** AST 기반 추출을 srcML로 대체하여 파싱 불가능한 학생 코드도 처리할 수 있도록 Code-DKT를 확장.
- **연관성:** 학생의 미완성 코드는 종종 올바르게 파싱되지 않기 때문에 실제 배포 환경에서 중요한 논문.

### 3-3. Knowledge Tracing in Programming Education Integrating Students' Questions [우선 읽기 추천]
- **저자:** Kim, D., Kim, S., & Jo, Y.
- **학회:** ACL '25 (Annual Meeting of the Association for Computational Linguistics), Vol. 1
- **연도:** 2025
- **링크:** https://arxiv.org/abs/2502.10408
- **핵심 내용:** 학생의 자연어 질문과 자동 추출된 기술 정보를 활용하는 SQKT를 소개하여, 기존 베이스라인 대비 AUC 33.1% 향상 달성.
- **연관성:** 코드 편집 외의 추가 신호(예: 학생 질문, 검색 쿼리)를 AI-PS 학습자 모델에 활용하는 영감을 줄 수 있음.

### 3-4. HELP-DKT: An Interpretable Cognitive Model of How Students Learn Programming Based on Deep Knowledge Tracing
- **저자:** Liang, Y., Peng, T., Pu, Y., & Wu, W.
- **학회:** Scientific Reports, 12, 3896
- **연도:** 2022
- **링크:** https://www.nature.com/articles/s41598-022-07956-0
- **핵심 내용:** 학생 코드와 오류 유형을 인코딩하여 학생 능력을 개인화된 방식으로 추정할 수 있는 해석 가능한 프로그래밍 특화 DKT.
- **연관성:** 해석 가능성 측면이 유용함 — AI-PS 시스템은 사용자 신뢰를 유지하기 위해 자동완성을 제공하지 않는 이유를 설명할 수 있어야 함.

### 3-5. Difficulty Aware Programming Knowledge Tracing via Large Language Models
- **저자:** Yang, L., Sun, X., Li, H., Xu, R., & Wei, X.
- **학회:** Scientific Reports, 15, 11436
- **연도:** 2025
- **링크:** https://www.nature.com/articles/s41598-025-96540-3
- **핵심 내용:** LLM을 활용하여 프로그래밍 문제의 텍스트 이해 난이도와 지식 개념 난이도를 추출하여 더 정확한 지식 추적을 수행.
- **연관성:** LLM이 지식 추적을 향상시킬 수 있음을 보여줌 — 프로젝트의 LLM 기반 개념 연계 접근 방식과 일치함.

### 3-6. From Code to Concepts: Textbook-Driven Knowledge Tracing with LLMs in CS1 [우선 읽기 추천]
- **저자:** Smith, S., Wei, H., O'Neill, A., Durai, A., DeNero, J., Zamfirescu-Pereira, J.D., & Norouzi, N.
- **학회:** SIGCSE '25 (ACM Technical Symposium on Computer Science Education), Vol. 2
- **연도:** 2025
- **링크:** https://dl.acm.org/doi/10.1145/3641555.3705187
- **핵심 내용:** LLM을 활용하여 학생의 과제 코드를 교과서 개념에 매핑하고 지식 상태를 동적으로 업데이트. LLM 코드 이해와 학습자 모델링을 직접적으로 연결함.
- **연관성:** AI-PS 2분기 과제인 코드-프로그래밍 개념 연계 작업과 매우 밀접하게 관련됨. 개념 연계 파이프라인의 베이스라인 또는 영감이 될 수 있음.

---

## 주제 4: LLM 기반 코드 이해 및 의도 파악

### 4-1. SpecRover: Code Intent Extraction via LLMs
- **저자:** Ruan, H., Zhang, Y., & Roychoudhury, A.
- **학회:** ICSE '25 (IEEE/ACM International Conference on Software Engineering)
- **연도:** 2024
- **링크:** https://arxiv.org/abs/2408.02232
- **핵심 내용:** LLM을 활용한 반복적 명세 추론을 통해 코드에서 개발자 의도를 추출하는 방법을 보여줌.
- **연관성:** 학생의 미완성 코드가 무엇을 달성하려 하는지 추론하는 것(2분기 의도 파악)에 직접적으로 관련됨.

### 4-2. SemCoder: Training Code Language Models with Comprehensive Semantics Reasoning
- **저자:** Ding, Y., Peng, J., Min, M.J., Kaiser, G., Yang, J., & Ray, B.
- **학회:** NeurIPS '24
- **연도:** 2024
- **링크:** https://arxiv.org/abs/2406.01006
- **핵심 내용:** "독백 추론"(순방향 및 역방향 실행 트레이스)을 통해 코드 의미론에 대해 추론하도록 코드 LLM을 훈련시켜, 코드가 무엇을 하고 왜 하는지에 대한 더 깊은 이해를 가능하게 함.
- **연관성:** 미완성 코드에서의 의도 파악 및 개념 추출 정확도를 향상시킬 수 있음.

### 4-3. Using an LLM to Help With Code Understanding
- **저자:** Nam, D., Macvean, A., Hellendoorn, V., Vasilescu, B., & Myers, B.
- **학회:** ICSE '24 (IEEE/ACM International Conference on Software Engineering)
- **연도:** 2024
- **링크:** https://arxiv.org/abs/2307.08177
- **핵심 내용:** GPT-3.5를 활용하여 코드를 설명하고, API 호출을 기술하고, 도메인 용어를 명확히 하는 IDE 플러그인. 32명의 참가자를 대상으로 평가하여 웹 검색보다 이해에 도움이 됨을 확인.
- **연관성:** AI-PS에 필요한 것과 유사한 아키텍처를 가진 실제 작동하는 LLM 기반 IDE 플러그인을 보여줌.

---

## 주제 5: 교육용 VS Code 확장 / IDE 플러그인

### 5-1. Explorotron: An IDE Extension for Guided and Independent Code Exploration and Learning
- **저자:** Malaise, Y. & Signer, B.
- **학회:** Koli Calling '23 (International Conference on Computing Education Research)
- **연도:** 2023
- **링크:** https://dl.acm.org/doi/10.1145/3631802.3631816
- **핵심 내용:** PRIMM 교수법을 기반으로 코드 예제를 탐색하기 위한 여러 "학습 렌즈"를 제공하는 VS Code 확장.
- **연관성:** 교육용 VS Code 플러그인 모델로 직접 참고 가능. 3분기 플러그인 설계에 좋은 레퍼런스.

### 5-2. GPTutor: A ChatGPT-Powered Programming Tool for Code Explanation
- **저자:** Chen, E., Huang, R., Chen, H.-S., Tseng, Y.-H., & Li, L.-Y.
- **학회:** AIED '23 (Artificial Intelligence in Education), LNCS 13916, Springer
- **연도:** 2023
- **링크:** https://link.springer.com/chapter/10.1007/978-3-031-36336-8_50
- **핵심 내용:** ChatGPT를 활용한 코드 설명용 VS Code 확장. 기본 ChatGPT나 Copilot보다 더 간결하고 정확한 설명을 제공.
- **연관성:** LLM 기반 교육 기능을 VS Code에 통합하는 방법을 보여줌.

### 5-3. CodeHelp: Using Large Language Models with Guardrails for Scalable Support in Programming Classes
- **저자:** Liffiton, M., Sheese, B., Savelka, J., & Denny, P.
- **학회:** Koli Calling '23 (International Conference on Computing Education Research)
- **연도:** 2023
- **링크:** https://dl.acm.org/doi/10.1145/3631802.3631830
- **핵심 내용:** 해답을 직접 제공하지 않으면서 온디맨드 지원을 하는 교육적 가이드레일이 적용된 LLM 기반 도구. 한 학기 동안 49명의 학생을 대상으로 배포.
- **연관성:** AI-PS와 동일한 철학을 공유함 — 답을 알려주지 않으면서 도와주기. 평가 시 좋은 비교 대상.

### 5-4. Overcoming Barriers in Scaling Computing Education Research Programming Tools: A Developer's Perspective
- **저자:** Tran, K., Bacher, J., Shi, Y., Skripchuk, J., & Price, T.W.
- **학회:** ICER '24 (ACM Conference on International Computing Education Research), Vol. 1
- **연도:** 2024
- **링크:** https://dl.acm.org/doi/10.1145/3632620.3671113
- **핵심 내용:** 교육용 IDE 도구의 확장 과정에서의 도전에 대해 16명의 CER 도구 개발자를 인터뷰. 교육용 VS Code 확장 구축 및 유지관리를 위한 실질적 가이드를 제공.
- **연관성:** 3분기 플러그인 개발을 위한 필수 실무 참고 자료. 다른 사람들의 실수에서 배울 수 있음.

### 5-5. CodeWatcher: IDE Telemetry Data Extraction Tool for Understanding Coding Interactions with LLMs
- **저자:** Basha, M., Ribeiro, A.M., Javahar, J., de Souza, C.R.B., & Rodriguez-Perez, G.
- **학회:** ICSME '25 (IEEE International Conference on Software Maintenance and Evolution)
- **연도:** 2025
- **링크:** https://arxiv.org/abs/2510.11536
- **핵심 내용:** 학생-LLM 코딩 상호작용에 대한 텔레메트리 데이터를 캡처하는 VS Code 확장.
- **연관성:** AI-PS 시스템의 학습자 행동 모니터링 구성 요소를 위한 인프라 참고 자료로 유용.

---

## 주제 6: 프로그래밍을 위한 적응형 / 지능형 튜터링 시스템

### 6-1. CodeTailor: LLM-Powered Personalized Parsons Puzzles for Engaging Support While Learning Programming [우선 읽기 추천]
- **저자:** Hou, X., Wu, Z., Wang, X., & Ericson, B.
- **학회:** L@S '24 (ACM Conference on Learning @ Scale)
- **연도:** 2024
- **링크:** https://dl.acm.org/doi/10.1145/3657604.3662032
- **핵심 내용:** 학생의 특정 오류 코드에 맞게 LLM이 생성한 Parsons 퍼즐을 적응시킴. 학생의 88%가 직접 해답을 받는 것보다 이 방식을 선호함.
- **연관성:** 적응형 비계의 모델. AI-PS 시스템에서의 "Parsons 퍼즐 폴백" 모드에 영감을 줄 수 있음.

### 6-2. Data-Driven Hint Generation in Vast Solution Spaces: A Self-Improving Python Programming Tutor (ITAP)
- **저자:** Rivers, K. & Koedinger, K.R.
- **학회:** International Journal of Artificial Intelligence in Education (IJAIED), 27, pp. 37-64
- **연도:** 2017
- **링크:** https://link.springer.com/article/10.1007/s40593-015-0070-z
- **핵심 내용:** Python을 위한 개인화된 힌트를 자동 생성하고 더 많은 학생 데이터를 수집함에 따라 자기 개선하는 데이터 기반 ITS에 대한 기초 연구.
- **연관성:** 자기 개선 측면은 AI-PS 시스템의 학습자 모델이 시간이 지남에 따라 더 많은 사용자 데이터로 개선되는 방법에 대한 참고가 될 수 있음.

### 6-3. Learner Model for Adaptive Scaffolding in Intelligent Tutoring Systems for Organizing Programming Knowledge
- **저자:** Koike, K., Okubo, F., & Yamada, T.
- **학회:** HCII '21 (Human Interface and the Management of Information), LNCS 12766, Springer
- **연도:** 2021
- **링크:** https://link.springer.com/chapter/10.1007/978-3-030-78361-7_6
- **핵심 내용:** 프로그래밍 ITS에서의 적응형 비계를 위한 솔루션 수준의 숙련도를 캡처하는 학습자 모델을 제안.
- **연관성:** AI-PS의 3단계 학습자 모델 설계에 직접적으로 참고가 됨.

### 6-4. Scaffolding CS1 Courses with a Large Language Model-Powered Intelligent Tutoring System
- **저자:** Cao, C.
- **학회:** IUI '23 Companion (ACM Conference on Intelligent User Interfaces)
- **연도:** 2023
- **링크:** https://dl.acm.org/doi/10.1145/3581754.3584111
- **핵심 내용:** GPT-3와 게이미피케이션을 결합하여 CS1 학습을 비계화. 예비 결과에서 불안감 감소와 소속감 증가를 확인.
- **연관성:** LLM 기반 적응형 비계가 실현 가능하고 학생들에게 호평받음을 보여줌.

### 6-5. ECKT: Enhancing Code Knowledge Tracing via Large Language Models
- **저자:** Yu, Y., Zhou, Y., Zhu, Y., Ye, Y., Chen, L., & Chen, M.
- **학회:** CogSci '24 (Annual Meeting of the Cognitive Science Society), 46
- **연도:** 2024
- **링크:** https://escholarship.org/uc/item/8001b5mp
- **핵심 내용:** Chain-of-thought 프롬프팅과 few-shot 학습을 사용하여 학생 코드에서 상세한 문제 설명과 지식 개념을 생성.
- **연관성:** 지식 추적과 LLM 기반 코드 이해를 연결함 — 주제 3과 4를 결합.



---

# 교수님 미팅 준비 자료 (데이터셋 구축 방향성)

## 1. 미완성 코드 데이터셋 구축 관련 질문 리스트 (Downstream Task 확인)

데이터의 수집 방법(사람 모집 vs 크롤링 vs LLM 생성)을 결정하기 위해 최종 모델의 목적과 데이터 형태를 명확히 해야 합니다.

**Q1. 이 데이터셋을 학습시켜서 최종적으로 어떤 모델/시스템을 만드는 것이 목표인가요?**
- A (지식 추적): 학생의 틀린 코드를 보고 모르는 개념 진단 -> 최종 코드 스냅샷 + 에러 메시지 필요
- B (자동 수정/힌트): 틀린 코드에 대한 힌트 제공 또는 자동 수정 -> 틀린 코드와 정답 코드 쌍(Pair) 대량 필요
- C (과정 분석): 코딩 과정에서의 인지적 흐름 분석 -> 키스토로크(Keystroke) 등 시계열 데이터 필요 (직접 수집 불가피)

**Q2. 데이터의 형태는 '최종 제출물(스냅샷)'만 있으면 되나요, 아니면 '작성 과정 전체(로그)'가 필요한가요?**
- 과정 전체가 필요하다면 로깅 툴을 통한 직접 수집이 필요함.
- 스냅샷만 필요하다면 기존 오픈 데이터(Codeforces 등)나 LLM(GPT-4)을 활용한 합성이 훨씬 효율적임.

**Q3. 미완성 코드와 프로그래밍 개념 KG는 구체적으로 어떻게 연결되나요?**
- 코드의 특정 줄(Line)에서 발생한 에러와 특정 개념 노드의 1:1 매핑인지?
- 코드 전체의 논리적 오류와 여러 개념 노드의 다대다(N:M) 매핑인지?

**Q4. 타겟으로 하는 프로그래밍 난이도와 언어는 어느 정도인가요?**
- 파이썬 기초 문법(변수, 조건/반복문) 위주인지?
- 자료구조/알고리즘(트리, 그래프 탐색 등) 레벨까지 포함하는지?

---

## 2. 프로그래밍 핵심 개념 KG (CS-KG 2.0 활용 제안)

**CS-KG 2.0 개요**
- 약 1,500만 건의 컴퓨터 과학 논문에서 자연어 처리(NLP)를 통해 추출된 6,700만 개의 관계/개념을 포함하는 초대형 컴퓨터 과학 지식 그래프.

**제안 방향: CS-KG 2.0 + Human Annotation**
- 온톨로지를 바닥부터 구축하는 대신, CS-KG 2.0을 뼈대(Backbone)로 활용 제안.
- "프로그래밍 기초 교육"과 관련된 서브그래프(Subgraph)만 추출.
- 이후 학생들의 오개념(Misconception)이나 자주 하는 실수 패턴을 Human Annotation으로 정교하게 추가/수정하여 품질과 효율성을 동시 확보.
