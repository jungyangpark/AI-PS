def digit_sum(n):
    # 종료 조건
    if n < 10:
        return n

    # 마지막 자릿수 + 나머지 숫자의 자릿수 합
    return n % 10 + digit_sum(n // 10)

n = int(input())
print(digit_sum(n))