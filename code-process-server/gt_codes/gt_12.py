def solve(grid):
    H, W = len(grid), len(grid[0])

    for c in range(1, W):
        grid[0][c] += grid[0][c-1]

    for r in range(1, H):
        grid[r][0] += grid[r-1][0]

    for r in range(1, H):
        for c in range(1, W):
            grid[r][c] += min(grid[r][c-1], grid[r-1][c])

    return grid[-1][-1]

s = input()
rows = s[2:-2].split("],[")
grid = []

for row in rows:
    grid.append(list(map(int, row.split(","))))

print(solve(grid))