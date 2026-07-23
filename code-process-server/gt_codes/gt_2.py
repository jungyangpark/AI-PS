def find_max(arr, idx):
    # 마지막 원소라면 그 원소가 최댓값
    if idx == len(arr) - 1:
        return arr[idx]

    # 나머지 부분의 최댓값
    max_rest = find_max(arr, idx + 1)

    # 현재 원소와 비교
    if arr[idx] > max_rest:
        return arr[idx]
    else:
        return max_rest


n = int(input())
arr = list(map(int, input().split()))

print(find_max(arr, 0))