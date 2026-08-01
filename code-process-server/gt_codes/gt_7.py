MOD = 1000000007

def padovan(n):
	dp = [1] * (n + 1)
	dp[0] = 0
	for idx in range(3, n + 1):
		dp[idx] = (dp[idx-3] + dp[idx-2]) % MOD
	return dp[n]

n = int(input())
print(padovan(n))