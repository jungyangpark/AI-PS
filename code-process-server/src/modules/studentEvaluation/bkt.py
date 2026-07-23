"""
Bayesian Knowledge Tracing (BKT) Module

KC 구성:
  1. 기본 KC (BASE_KCS, 20개) - 모든 문제에 공통으로 적용
  2. Algorithm-specific KC - 알고리즘별로 추가되는 KC

정답 정의:
  correct = 1  X-Submission.Success
  correct = 0  X-Submission.WrongAnswer / WrongAlgorithm / RuntimeError

파라미터 초기값 (파일럿 후 재추정 예정):
  기본 KC:        P(L0)=0.10, P(T)=0.25
  Alg-specific:   P(L0)=0.05, P(T)=0.20
  P(G)=0.20, P(S)=0.10 고정
"""

# ============================================================================
# 1. KC 정의
# ============================================================================

# 기본 KC (20개) - 모든 문제에 공통 적용
BASE_KCS = [
    # 입출력·기본 (4개)
    'input_str', 'input_cast', 'output', 'assignment',

    # 제어 흐름 (5개)
    'conditional', 'loop_counting', 'loop_until',
    'loop_elements', 'loop_nested',

    # 함수 (3개)
    'function_call', 'function_def', 'function_return',

    # 자료구조 (5개)
    'list', 'list_2d', 'dictionary', 'set', 'tuple',

    # 기타 (3개)
    'stat_calculate', 'file_read', 'file_write',
]

# Algorithm-specific KC - 알고리즘별로 추가
ALGORITHM_SPECIFIC_KCS = {
    'recursion': [
        'rec_base_case',    # base case 조건 작성
        'rec_call',         # recursive call 작성
        'rec_convergence',  # 인자 수렴 여부
    ],
    'dp': [
        'dp_memoization',   # memoization 자료구조 선언
        'dp_base_init',     # base case 초기화
        'dp_recurrence',    # 점화식 구현
    ],
    # 필요시 추가 알고리즘 KC 정의
    # 'greedy': [...],
    # 'graph': [...],
    # 'sorting': [...],
}

# Backward compatibility
FALCON_KCS = BASE_KCS
RECURSION_KCS = ALGORITHM_SPECIFIC_KCS['recursion']
DP_KCS = ALGORITHM_SPECIFIC_KCS['dp']

# 전체 KC 리스트
ALL_KCS = BASE_KCS + RECURSION_KCS + DP_KCS

# 2. Q-matrix
# 각 문제가 어떤 KC를 요구하는지 (1 = 필요)
# 파일럿 전 초안 — KC 확정 후 수정 예정

Q_MATRIX = {
    # 재귀 문제 (Day 2, 6문제)
    'REC_P1': {  # 팩토리얼
        'conditional': 1, 'function_def': 1, 'function_return': 1,
        'function_call': 1,
        'rec_base_case': 1, 'rec_call': 1, 'rec_convergence': 1,
    },
    'REC_P2': {  # 피보나치
        'conditional': 1, 'function_def': 1, 'function_return': 1,
        'function_call': 1, 'stat_calculate': 1,
        'rec_base_case': 1, 'rec_call': 1, 'rec_convergence': 1,
    },
    'REC_P3': {  # 하노이 탑
        'conditional': 1, 'function_def': 1, 'function_return': 1,
        'function_call': 1, 'output': 1,
        'rec_base_case': 1, 'rec_call': 1, 'rec_convergence': 1,
    },
    'REC_P4': {
        'conditional': 1, 'loop_counting': 1,
        'function_def': 1, 'function_return': 1, 'function_call': 1,
        'rec_base_case': 1, 'rec_call': 1, 'rec_convergence': 1,
    },
    'REC_P5': {
        'conditional': 1, 'function_def': 1, 'function_return': 1,
        'function_call': 1, 'list': 1,
        'rec_base_case': 1, 'rec_call': 1, 'rec_convergence': 1,
    },
    'REC_P6': {
        'conditional': 1, 'function_def': 1, 'function_return': 1,
        'function_call': 1, 'stat_calculate': 1,
        'rec_base_case': 1, 'rec_call': 1, 'rec_convergence': 1,
    },
    # DP 문제 (Day 3, 6문제)
    'DP_P1': {  # memoization 기본
        'conditional': 1, 'function_def': 1, 'function_return': 1,
        'function_call': 1, 'dictionary': 1,
        'dp_memoization': 1, 'dp_base_init': 1, 'dp_recurrence': 1,
    },
    'DP_P2': {
        'conditional': 1, 'loop_counting': 1,
        'function_def': 1, 'function_return': 1, 'list': 1,
        'dp_memoization': 1, 'dp_base_init': 1, 'dp_recurrence': 1,
    },
    'DP_P3': {
        'conditional': 1, 'loop_counting': 1,
        'function_def': 1, 'function_return': 1,
        'list': 1, 'stat_calculate': 1,
        'dp_memoization': 1, 'dp_base_init': 1, 'dp_recurrence': 1,
    },
    'DP_P4': {
        'loop_counting': 1, 'function_def': 1, 'function_return': 1,
        'list': 1, 'stat_calculate': 1,
        'dp_memoization': 1, 'dp_base_init': 1, 'dp_recurrence': 1,
    },
    'DP_P5': {
        'conditional': 1, 'loop_counting': 1,
        'function_def': 1, 'function_return': 1,
        'list': 1, 'stat_calculate': 1,
        'dp_memoization': 1, 'dp_base_init': 1, 'dp_recurrence': 1,
    },
    'DP_P6': {
        'conditional': 1, 'loop_counting': 1, 'loop_nested': 1,
        'function_def': 1, 'function_return': 1,
        'list_2d': 1, 'stat_calculate': 1,
        'dp_memoization': 1, 'dp_base_init': 1, 'dp_recurrence': 1,
    },
}


# ============================================================================
# 3. BKT 파라미터
# ============================================================================

DEFAULT_PARAMS = {}

# 기본 KC 파라미터 (20개)
for kc in BASE_KCS:
    DEFAULT_PARAMS[kc] = {
        'p_l0': 0.10,   # 초기 숙달 확률
        'p_t':  0.25,   # 학습 확률 (transition)
        'p_g':  0.20,   # Guess 확률
        'p_s':  0.10,   # Slip 확률
    }

# Algorithm-specific KC 파라미터 (재귀/DP는 더 어려움)
for kc in RECURSION_KCS + DP_KCS:
    DEFAULT_PARAMS[kc] = {
        'p_l0': 0.05,   # 초기 숙달 확률 (낮음)
        'p_t':  0.20,   # 학습 확률 (천천히)
        'p_g':  0.20,   # Guess 확률
        'p_s':  0.10,   # Slip 확률
    }

MASTERY_THRESHOLD = 0.95

# 제출 이벤트 분류
SUCCESS_EVENTS = {'X-Submission.Success'}
FAIL_EVENTS    = {
    'X-Submission.WrongAnswer',
    'X-Submission.WrongAlgorithm',
    'X-Submission.RuntimeError',
}


# 4. BKT 업데이트 함수

def bkt_update(p_l, correct, p_g, p_s, p_t):
    """
    정답/오답 관찰 후 P(mastery) 업데이트
    """
    if correct:
        p_l_obs = (p_l * (1 - p_s)) / (p_l * (1 - p_s) + (1 - p_l) * p_g)
    else:
        p_l_obs = (p_l * p_s) / (p_l * p_s + (1 - p_l) * (1 - p_g))

    return p_l_obs + (1 - p_l_obs) * p_t


def update_on_submission(p_mastery, prob_id, submission_event, params=None):
    """
    제출 이벤트 발생 시 해당 문제의 KC들을 업데이트
    X-Submission 이벤트마다 실시간 호출 예정

    Args:
        p_mastery        : 현재 KC별 P(mastery) 딕셔너리
        prob_id          : 문제 ID (예: 'REC_P1')
        submission_event : 'X-Submission.Success' 등
        params           : KC별 파라미터 (None이면 DEFAULT_PARAMS)

    Returns:
        업데이트된 p_mastery
    """
    if params is None:
        params = DEFAULT_PARAMS

    if prob_id not in Q_MATRIX:
        print(f"  [경고] Q_MATRIX에 {prob_id} 없음")
        return p_mastery

    correct = 1 if submission_event in SUCCESS_EVENTS else 0
    related_kcs = [kc for kc, req in Q_MATRIX[prob_id].items() if req == 1]

    for kc in related_kcs:
        if kc not in p_mastery:
            continue
        old = p_mastery[kc]
        p_mastery[kc] = bkt_update(
            old, correct,
            params[kc]['p_g'],
            params[kc]['p_s'],
            params[kc]['p_t'],
        )

    return p_mastery


def update_on_kcs(p_mastery, kcs, success, params=None):
    """
    KC 리스트 기반으로 P(mastery) 업데이트
    Q-matrix 대신 직접 KC 리스트를 받아서 처리

    Args:
        p_mastery : 현재 KC별 P(mastery) 딕셔너리
        kcs       : 제출에서 추출된 KC 리스트
        success   : 제출 성공 여부 (True/False)
        params    : KC별 파라미터 (None이면 DEFAULT_PARAMS)

    Returns:
        업데이트된 p_mastery
    """
    if params is None:
        params = DEFAULT_PARAMS

    correct = 1 if success else 0

    for kc in kcs:
        if kc not in params:
            # KC가 파라미터에 없으면 기본값 사용
            continue

        if kc not in p_mastery:
            p_mastery[kc] = params[kc]['p_l0']

        old = p_mastery[kc]
        p_mastery[kc] = bkt_update(
            old, correct,
            params[kc]['p_g'],
            params[kc]['p_s'],
            params[kc]['p_t'],
        )

    return p_mastery


def initialize_mastery(kcs=None):
    """
    P(mastery) 초기화

    Args:
        kcs : 초기화할 KC 리스트 (None이면 ALL_KCS)

    Returns:
        KC별 초기 P(mastery) 딕셔너리
    """
    if kcs is None:
        kcs = ALL_KCS

    return {kc: DEFAULT_PARAMS[kc]['p_l0'] for kc in kcs if kc in DEFAULT_PARAMS}


def get_algorithm_kcs(algorithm_name):
    """
    특정 알고리즘의 KC 리스트 반환

    Args:
        algorithm_name: 'recursion', 'dp' 등

    Returns:
        해당 알고리즘의 KC 리스트
    """
    return ALGORITHM_SPECIFIC_KCS.get(algorithm_name, [])


def get_all_kcs_for_algorithm(algorithm_name):
    """
    기본 KC + 특정 알고리즘 KC 반환

    Args:
        algorithm_name: 'recursion', 'dp' 등

    Returns:
        기본 KC + 알고리즘 KC 리스트
    """
    return BASE_KCS + get_algorithm_kcs(algorithm_name)


def is_base_kc(kc):
    """KC가 기본 KC인지 확인"""
    return kc in BASE_KCS


def is_algorithm_specific_kc(kc):
    """KC가 algorithm-specific KC인지 확인"""
    for alg_kcs in ALGORITHM_SPECIFIC_KCS.values():
        if kc in alg_kcs:
            return True
    return False


def get_mastery_summary(p_mastery):
    """
    P(mastery) 요약 정보 반환

    Returns:
        dict with avg_base, avg_alg, avg_all, bkt_weight, mastered_kcs
    """
    # 기본 KC와 알고리즘 KC 분리
    base_kcs_in_mastery = [kc for kc in BASE_KCS if kc in p_mastery]
    alg_kcs_in_mastery = [kc for kc in p_mastery if is_algorithm_specific_kc(kc)]

    # 평균 계산
    avg_base = sum(p_mastery[kc] for kc in base_kcs_in_mastery) / len(base_kcs_in_mastery) if base_kcs_in_mastery else 0
    avg_alg = sum(p_mastery[kc] for kc in alg_kcs_in_mastery) / len(alg_kcs_in_mastery) if alg_kcs_in_mastery else 0
    avg_all = sum(p_mastery.values()) / len(p_mastery) if p_mastery else 0

    bkt_weight = 1 - avg_alg

    # 숙달된 KC 분류
    mastered_kcs = [kc for kc, p in p_mastery.items() if p >= MASTERY_THRESHOLD]
    mastered_base_kcs = [kc for kc in mastered_kcs if is_base_kc(kc)]
    mastered_alg_kcs = [kc for kc in mastered_kcs if is_algorithm_specific_kc(kc)]

    return {
        'avg_base': avg_base,
        'avg_alg': avg_alg,
        'avg_all': avg_all,
        'bkt_weight': bkt_weight,
        'mastered_kcs': mastered_kcs,
        'mastered_base_kcs': mastered_base_kcs,
        'mastered_alg_kcs': mastered_alg_kcs,
        'mastered_count': len(mastered_kcs),
        'total_kcs': len(p_mastery),
        'base_kc_count': len(base_kcs_in_mastery),
        'alg_kc_count': len(alg_kcs_in_mastery)
    }
