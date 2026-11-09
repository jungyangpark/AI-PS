text = input()
s = int(input())
e = int(input())

middle = text[s:e+1]

reversed_part = ""
for ch in middle:
    reversed_part = ch + reversed_part

result = text[:s].lower() + reversed_part.upper() + text[e+1:].lower()

print(result)
