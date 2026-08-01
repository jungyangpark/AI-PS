def find(idx, mn, mx):
    if idx == len(nums):
        return f"{mn} {mx}"

    mn = min(mn, nums[idx])
    mx = max(mx, nums[idx])

    return find(idx + 1, mn, mx)

s = input()
nums = list(map(int, s.split()))
print(find(1, nums[0], nums[0]))