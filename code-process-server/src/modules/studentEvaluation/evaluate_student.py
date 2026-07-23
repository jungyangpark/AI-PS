#!/usr/bin/env python3
"""
Student Evaluation Main Script

입력:
  - student_id: 학생 ID
  - csv_path: 로그 CSV 파일 경로
  - kcs: 제출 코드에서 추출된 KC 리스트
  - success: 제출 성공 여부
  - current_mastery: 현재 KC별 P(mastery) (선택)

출력:
  - bkt_result: BKT 계산 결과 (updated_mastery, summary)
  - struggling_result: Struggling Score 계산 결과
"""

import json
import sys
import os

# 같은 디렉토리의 모듈 import
import bkt
import struggling_score


def evaluate_student(
    student_id,
    csv_path,
    kcs,
    success,
    current_mastery=None,
    level=None
):
    """
    학생 평가 수행

    Args:
        student_id: 학생 ID
        csv_path: MainTable CSV 파일 경로
        kcs: 제출 코드에서 추출된 KC 리스트
        success: 제출 성공 여부 (True/False)
        current_mastery: 현재 KC별 P(mastery) 딕셔너리 (선택)
        level: 문제 난이도 (1 or 3, 선택)

    Returns:
        dict: BKT 결과 + Struggling Score 결과
    """
    result = {
        'student_id': student_id,
        'success': success
    }

    # 1. BKT 계산
    if current_mastery is None:
        # 초기화: 제출된 KC들만 초기화
        p_mastery = bkt.initialize_mastery(kcs)
    else:
        p_mastery = current_mastery.copy()

        # 새로운 KC가 있으면 초기화
        for kc in kcs:
            if kc not in p_mastery and kc in bkt.DEFAULT_PARAMS:
                p_mastery[kc] = bkt.DEFAULT_PARAMS[kc]['p_l0']

    # KC 기반 업데이트
    updated_mastery = bkt.update_on_kcs(p_mastery, kcs, success)
    mastery_summary = bkt.get_mastery_summary(updated_mastery)

    result['bkt_result'] = {
        'updated_mastery': updated_mastery,
        'summary': mastery_summary
    }

    # 2. Struggling Score 계산 (CSV 파일이 있는 경우)
    if csv_path and os.path.exists(csv_path):
        try:
            struggling_result = struggling_score.analyze_csv(csv_path, level)
            result['struggling_result'] = struggling_result

            # BKT weight와 Struggling Score ratio 결합
            bkt_weight = mastery_summary['bkt_weight']
            struggling_ratio = struggling_result['struggling_score']['ratio']

            # Combined score 계산 (예: 가중 평균)
            # bkt_weight가 높을수록 struggling 가능성 높음
            combined_score = (bkt_weight + struggling_ratio) / 2

            result['combined_score'] = {
                'bkt_weight': bkt_weight,
                'struggling_ratio': struggling_ratio,
                'combined': combined_score,
                'interpretation': get_interpretation(combined_score)
            }
        except Exception as e:
            result['struggling_result'] = {
                'error': str(e)
            }
    else:
        result['struggling_result'] = {
            'error': 'CSV file not found or not provided'
        }

    return result


def get_interpretation(combined_score):
    """
    Combined score 해석

    Args:
        combined_score: 0~1 사이의 점수

    Returns:
        str: 해석 메시지
    """
    if combined_score >= 0.7:
        return 'High struggling - needs immediate intervention'
    elif combined_score >= 0.5:
        return 'Moderate struggling - monitor closely'
    elif combined_score >= 0.3:
        return 'Low struggling - minor difficulties'
    else:
        return 'No significant struggling detected'


def main():
    """
    CLI 진입점
    JSON 입력을 받아서 평가 수행 후 JSON 출력
    """
    if len(sys.argv) > 1:
        # 파일에서 입력 읽기
        input_path = sys.argv[1]
        with open(input_path, 'r') as f:
            input_data = json.load(f)
    else:
        # stdin에서 입력 읽기
        input_data = json.load(sys.stdin)

    # 입력 파라미터 추출
    student_id = input_data.get('student_id')
    csv_path = input_data.get('csv_path')
    kcs = input_data.get('kcs', [])
    success = input_data.get('success', False)
    current_mastery = input_data.get('current_mastery')
    level = input_data.get('level')

    # 평가 수행
    result = evaluate_student(
        student_id=student_id,
        csv_path=csv_path,
        kcs=kcs,
        success=success,
        current_mastery=current_mastery,
        level=level
    )

    # JSON 출력
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
