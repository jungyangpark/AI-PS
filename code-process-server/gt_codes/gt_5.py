def do(result, n):
    if result == n:
        return 1

    if result > n:
        return 0

    return do(result + 1, n) + do(result + 2, n)


n = int(input())
print(do(0, n))