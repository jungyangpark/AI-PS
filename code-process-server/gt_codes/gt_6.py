n = int(input())

strings = []
for i in range(n):
    strings.append(input())

result = 0

for s in strings:
    count = 0

    for t in strings:
        if len(s) == len(t):
            count += 1

    if count > result:
        result = count

print(result)
