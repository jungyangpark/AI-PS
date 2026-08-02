def solve(cost):
    dp = [0 for _ in range(len(cost))]
    dp[0] = cost[0]
    dp[1] = cost[1]
    for j in range(2, len(cost)):
        dp[j] = min(dp[j-2] + cost[j], dp[j-1] + cost[j])
    return min(dp[len(dp)-1], dp[len(dp)-2])

cost = list(map(int, input().split()))
print(solve(cost))