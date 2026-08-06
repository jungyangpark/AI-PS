memo = {}
def padovan(n):
    if n in memo:
        return memo[n]
    elif n <= 3 :
        f = 1
        memo[n] = f
        return f
    else: 
        
        f = (padovan(n-2) + padovan(n-3)) % 1000000007
        memo[n] = f
        return f
num = int(input())     
print(padovan(num))
