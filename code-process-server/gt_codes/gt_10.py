MOD = 1000000007

def padovan_optimized(n):
    if n == 1 or n == 2 or n == 3:
        return 1

    a = b = c = 1

    for i in range(n-3):
        a, b, c = b, c, (a + b) % MOD

    return c
 
 
n = int(input())
print(padovan_optimized(n))