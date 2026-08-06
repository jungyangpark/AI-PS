MOD = 1000000007
memo = {}

def uniquePaths(m, n):
    if m == 1 or n == 1:
        return 1
    
    if (m, n) in memo:
        return memo[(m, n)]

    memo[(m, n)] = (uniquePaths(m - 1, n) + uniquePaths(m, n - 1)) % MOD
    return memo[(m, n)]

m, n = input().split()
print(uniquePaths(int(m), int(n)))