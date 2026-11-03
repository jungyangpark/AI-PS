n = int(input())

foods = []
for i in range(n):
    food = input()
    foods.append(food)

foods_tuple = tuple(foods)
print(foods_tuple)

largest = foods_tuple[0]

for food in foods_tuple:
    if food > largest:
        largest = food

print(largest)
