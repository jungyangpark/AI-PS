n = int(input())

guests = []
for i in range(n):
    guest = input()
    guests.append(guest)

last_guest = guests[-1]
guests = guests[:-1]

guests.remove(guests[1])

guests = guests[:2] + [last_guest] + guests[2:]

print(last_guest)
print(guests)