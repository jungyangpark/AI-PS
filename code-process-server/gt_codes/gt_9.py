MOD = 1000000007
def countWays(n):
    if n == 0 or n == 1:
        return 1

    # base case for 2nd stair
    if n == 2:
        return 2

    dp = [0] * (n + 1)

    dp[0] = 1
    dp[1] = 1
    dp[2] = 2

    for i in range(3, n + 1):
        dp[i] = (dp[i - 1] + dp[i - 2] + dp[i - 3]) % MOD

    return dp[n]

n = int(input())
print(countWays(n))