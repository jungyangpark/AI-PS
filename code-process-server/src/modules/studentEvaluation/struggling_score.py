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

    total_seconds = max(
        (df['ts'].iloc[-1] - df['ts'].iloc[0]).total_seconds(), 1
    )

    # idle_ratio
    idle_seconds = sum(
        (df['ts'].iloc[i] - df['ts'].iloc[i-1]).total_seconds()
        for i in range(1, len(df))
        if (df['ts'].iloc[i] - df['ts'].iloc[i-1]).total_seconds() >= IDLE_THRESHOLD
    )
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


def analyze_csv(csv_path, level=None):
    """
    CSV 파일을 분석하여 Struggling Score 계산

    Args:
        csv_path: CSV 파일 경로
        level: 문제 난이도 (1 or 3)

    Returns:
        dict: features와 struggling_score 결과
    """
    df = pd.read_csv(csv_path)
    features = extract_features(df, level)
    score_result = compute_struggling_score(features)

    return {
        'features': features,
        'struggling_score': score_result
    }
