def countRecur(i, n):
    if i >= n:
        return 1

    take = countRecur(i + 2, n)
    noTake = countRecur(i + 1, n)

    return take + noTake

n = int(input())
print(countRecur(0, n))