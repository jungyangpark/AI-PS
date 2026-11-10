a = int(input())
b = int(input())

print("덧셈:", a + b)
print("뺄셈:", a - b)
print("곱셈:", a * b)
print("나눗셈:", a / b)
print("몫:", a // b)
print("나머지:", a % b)
print("거듭제곱:", a ** b)

print("괄호 없이:", a + b * 2)

print("괄호 사용:", (a + b) * 2)

a += b
a *= 2

print("최종 결과:", a)
