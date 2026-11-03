n = int(input())

foods = {}

for i in range(n):
    name = input()
    price = int(input())
    foods[name] = price


foods["lamb"] = 50

print(foods["fish"])

foods["fish"] = 100

print(foods)