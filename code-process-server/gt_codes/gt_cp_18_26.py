food = input()

food = food.lower()
food = food.replace('pizza', 'pasta')

print(food.upper())
print('a' in food)
print(food.find('a'))
print(len(food))
