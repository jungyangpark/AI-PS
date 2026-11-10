shopping = ["사과", "계란", "우유", "빵", "치즈"]

print("전체 목록:")
for item in shopping:
    print(item)

print("짝수 인덱스:")
for i in range(0, len(shopping), 2):
    print(shopping[i])
