def find_min_max(nums, idx=0):
    if idx == len(nums) - 1:
        return nums[idx], nums[idx]

    rest_min, rest_max = find_min_max(nums, idx + 1)
    cur = nums[idx]
    return min(cur, rest_min), max(cur, rest_max)

s = input()
nums = list(map(int, s.split()))
min_num, max_num = find_min_max(nums)
print(f"{min_num} {max_num}")