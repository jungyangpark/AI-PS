"""
Struggling Score Module

피처셋:
  Lv3: idle_ratio, delete_ratio, ac_accept_rate,
       wrong_answer_rate, runtime_error_rate, eq  → 최대 6점
  Lv1: idle_ratio, delete_ratio, ac_accept_rate,
       wrong_answer_rate, runtime_error_rate, eq  → 최대 6점
"""

import pandas as pd
from datetime import datetime
import re

# 설정값

IDLE_THRESHOLD = 10.0
TAB_MAX_LEN    = 8

# 제출 이벤트 분류
WRONG_ANSWER_EVENTS  = {'X-Submission.WrongAnswer'}
WRONG_ALGO_EVENTS    = {'X-Submission.WrongAlgorithm'}
RUNTIME_ERROR_EVENTS = {'X-Submission.RuntimeError'}
SUCCESS_EVENTS       = {'X-Submission.Success'}
ALL_FAIL_EVENTS      = WRONG_ANSWER_EVENTS | WRONG_ALGO_EVENTS | RUNTIME_ERROR_EVENTS

# 임계값 (파일럿 후 보정 예정)
THRESHOLDS = {
    'idle_ratio':         0.50,
    'delete_ratio':       0.40,
    'ac_accept_rate':     0.70,   # Lv1/Lv3 공통
    'wrong_answer_rate':  0.50,   # 전체 제출 중 WrongAnswer 비율
    'runtime_error_rate': 0.30,   # 전체 제출 중 RuntimeError 비율
    'eq':                 0.50,   # 제출 실패 반복 정도
}

# Lv1/Lv3 공통 피처셋
FEATURE_SET = ['idle_ratio', 'delete_ratio', 'ac_accept_rate',
               'wrong_answer_rate', 'runtime_error_rate', 'eq']


# 1. 유틸 함수

def parse_ts(ts_str):
    return datetime.fromisoformat(str(ts_str).replace('Z', '+00:00'))

def time_and_idle(timestamps):
    """정렬된 타임스탬프 → (첫~끝 경과 초, IDLE_THRESHOLD 이상 간격의 합)"""
    if len(timestamps) < 2:
        return 0.0, 0.0
    gaps = [(b - a).total_seconds() for a, b in zip(timestamps, timestamps[1:])]
    span = (timestamps[-1] - timestamps[0]).total_seconds()
    return span, sum(g for g in gaps if g >= IDLE_THRESHOLD)

def is_tab_paste(insert_text):
    if pd.isna(insert_text):
        return True
    content = re.sub(r'\[L\d+:\d+\]', '', str(insert_text)).strip()
    return len(content) <= TAB_MAX_LEN and content.replace(' ', '').replace('\t', '') == ''


# 2. EQ 계산

def compute_eq_from_submissions(sub_events):
    """
    제출 이벤트 시퀀스로 EQ를 근사합니다.
    실패(WrongAnswer + WrongAlgorithm + RuntimeError) 반복 패턴 기반
    """
    if len(sub_events) < 2:
        return 0.0

    total_pairs = len(sub_events) - 1
    penalty = 0.0

    for i in range(total_pairs):
        curr = sub_events[i]
        next_ = sub_events[i + 1]
        curr_fail = curr in ALL_FAIL_EVENTS
        next_fail = next_ in ALL_FAIL_EVENTS

        if curr_fail and next_fail:
            penalty += 8          # 둘 다 실패 → +8
            if curr == next_:
                penalty += 3      # 유형까지 같으면 → 추가 +3 (총 +11)

    # 정규화: 최대 점수는 쌍당 11점
    return penalty / (total_pairs * 11)


# 3. 피처 추출

def extract_features(df, level=None):
    """
    CSV 로그에서 피처 추출

    Args:
        df: pandas DataFrame (MainTable CSV)
        level: 문제 난이도 (1 or 3, 현재는 미사용)

    Returns:
        dict: 추출된 피처들
    """
    df = df.copy()
    df['ts'] = df['Timestamp'].apply(parse_ts)
    df = df.sort_values('ts').reset_index(drop=True)

    # idle_ratio
    span, idle_seconds = time_and_idle(df['ts'].tolist())
    total_seconds = max(span, 1)
    idle_ratio = idle_seconds / total_seconds

    # 편집 이벤트
    edit_df    = df[df['EventType'] == 'File.Edit']
    insert_df  = edit_df[edit_df['EditType'] == 'Insert']
    delete_df  = edit_df[edit_df['EditType'] == 'Delete']
    paste_df   = df[df['EventType'] == 'X-Paste']
    real_paste = paste_df[~paste_df['InsertText'].apply(is_tab_paste)]

    total_edit   = max(len(insert_df) + len(delete_df) + len(real_paste), 1)
    delete_ratio = len(delete_df) / total_edit

    # ac_accept_rate (Lv1/Lv3 공통 — X-Autocomplete.Accept)
    accept_events = df[
    (df['EventType'] == 'X-Autocomplete.Accept') |
    (df['EventType'] == 'X-Autocomplete.Follow')
]
    reject_events = df[df['EventType'] == 'X-Autocomplete.Reject']
    total_ac      = max(len(accept_events) + len(reject_events), 1)
    ac_accept_rate = len(accept_events) / total_ac

    # 제출 에러 피처
    sub_df      = df[df['EventType'].str.startswith('X-Submission.', na=False)]
    total_sub   = max(len(sub_df), 1)
    sub_events  = sub_df['EventType'].tolist()

    wrong_answer_count  = len(sub_df[sub_df['EventType'].isin(WRONG_ANSWER_EVENTS)])
    wrong_algo_count    = len(sub_df[sub_df['EventType'].isin(WRONG_ALGO_EVENTS)])
    runtime_error_count = len(sub_df[sub_df['EventType'].isin(RUNTIME_ERROR_EVENTS)])
    success_count       = len(sub_df[sub_df['EventType'].isin(SUCCESS_EVENTS)])

    wrong_answer_rate   = wrong_answer_count / total_sub
    runtime_error_rate  = runtime_error_count / total_sub

    # EQ (제출 실패 반복 패턴)
    eq = compute_eq_from_submissions(sub_events)

    return {
        # 기본 정보
        'total_seconds':      total_seconds,
        'idle_seconds':       idle_seconds,
        'insert_count':       len(insert_df),
        'delete_count':       len(delete_df),
        'real_paste_count':   len(real_paste),
        'wrong_answer_count': wrong_answer_count,
        'wrong_algo_count':   wrong_algo_count,
        'runtime_error_count':runtime_error_count,
        'success_count':      success_count,
        'total_sub':          total_sub,
        # 피처
        'idle_ratio':         idle_ratio,
        'delete_ratio':       delete_ratio,
        'ac_accept_rate':     ac_accept_rate,
        'wrong_answer_rate':  wrong_answer_rate,
        'runtime_error_rate': runtime_error_rate,
        'eq':                 eq,
    }


# 4. Struggling Score

def compute_struggling_score(features, thresholds=None):
    """
    피처를 기반으로 Struggling Score 계산

    Args:
        features: extract_features()에서 반환된 피처 딕셔너리
        thresholds: 커스텀 임계값 (None이면 THRESHOLDS 사용)

    Returns:
        dict: score, max_score, ratio, breakdown
    """
    if thresholds is None:
        thresholds = THRESHOLDS

    max_score = len(FEATURE_SET)
    score     = 0
    breakdown = {}

    for name in FEATURE_SET:
        val       = features.get(name, 0) or 0
        thr       = thresholds[name]
        triggered = val > thr
        breakdown[name] = int(triggered)
        score += int(triggered)

    ratio = score / max_score
    return {
        'score': score,
        'max_score': max_score,
        'ratio': ratio,
        'breakdown': breakdown
    }


def analyze_submission(csv_paths, current_submission, level=None):
    """
    이번 제출 한 건에 대한 Struggling Score 계산 (BKT와 같은 제출 단위)

    구간 = 직전 X-Submission.* 이벤트 이후 ~ 지금.
    과제를 다시 시작해 MainTable이 여러 개로 나뉘어도 같은 구간에 들어오며,
    파일 사이의 공백(VSCode를 껐다 켠 시간)은 idle로 세지 않는다.

    제출 피처(wrong_answer_rate, runtime_error_rate, eq)는
    [직전 제출 결과, 이번 제출 결과]로 계산한다. 이번 결과는 채점 직후라
    아직 로그에 없으므로 서버가 current_submission으로 넘겨준다.

    Args:
        csv_paths: 같은 학생·과제의 MainTable CSV 경로 리스트
        current_submission: 이번 채점 결과 이벤트명 (예: 'X-Submission.WrongAnswer')
        level: 문제 난이도 (1 or 3)

    Returns:
        dict: features, struggling_score, window(구간 정보)
    """
    frames = []
    for i, p in enumerate(csv_paths):
        part = pd.read_csv(p)
        part['_file'] = i
        frames.append(part)
    df = pd.concat(frames, ignore_index=True)
    # Leaving the page (X-Window.*, web course only) is logged for analysis, not scored:
    # extra events would split the gaps that make up idle time.
    df = df[~df['EventType'].astype(str).str.startswith('X-Window.')].reset_index(drop=True)
    df['ts'] = df['Timestamp'].apply(parse_ts)
    df = df.sort_values(['ts', 'EventID']).reset_index(drop=True)

    is_sub = df['EventType'].str.startswith('X-Submission.', na=False)
    prev_subs = df[is_sub]
    if len(prev_subs) > 0:
        last_idx = prev_subs.index[-1]
        prev_submission = df.loc[last_idx, 'EventType']
        window = df.loc[last_idx + 1:]
    else:
        prev_submission = None
        window = df

    features = extract_features(window.drop(columns=['ts']), level)

    # 파일별로 시간·idle을 계산해 더한다 → 파일 사이 공백 제외
    total_seconds = 0.0
    idle_seconds = 0.0
    for _, part in window.groupby('_file'):
        span, idle = time_and_idle(part['ts'].tolist())
        total_seconds += span
        idle_seconds += idle
    features['total_seconds'] = total_seconds
    features['idle_seconds'] = idle_seconds
    features['idle_ratio'] = idle_seconds / max(total_seconds, 1)

    # 제출 피처: [직전 결과, 이번 결과]
    sub_events = ([prev_submission] if prev_submission else []) + \
                 ([current_submission] if current_submission else [])
    total_sub = max(len(sub_events), 1)
    features['total_sub'] = total_sub
    features['wrong_answer_count'] = sum(e in WRONG_ANSWER_EVENTS for e in sub_events)
    features['wrong_algo_count'] = sum(e in WRONG_ALGO_EVENTS for e in sub_events)
    features['runtime_error_count'] = sum(e in RUNTIME_ERROR_EVENTS for e in sub_events)
    features['success_count'] = sum(e in SUCCESS_EVENTS for e in sub_events)
    features['wrong_answer_rate'] = features['wrong_answer_count'] / total_sub
    features['runtime_error_rate'] = features['runtime_error_count'] / total_sub
    features['eq'] = compute_eq_from_submissions(sub_events)

    score_result = compute_struggling_score(features)

    return {
        'features': features,
        'struggling_score': score_result,
        'window': {
            'files': len(csv_paths),
            'events': len(window),
            'prev_submission': prev_submission,
            'current_submission': current_submission,
        }
    }
