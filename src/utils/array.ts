export function sortBy<T, S>(
    list: T[],
    getValue: (x: T) => S,
    order: 'asc' | 'desc' = 'asc',
): T[] {
    // eslint-disable-next-line fp/no-mutating-methods
    return [...list].sort((a, b) => {
        const valA = getValue(a)
        const valB = getValue(b)

        if (valA > valB) return order === 'asc' ? 1 : -1
        if (valA < valB) return order === 'asc' ? -1 : 1
        return 0
    })
}

export function uniq<T>(list: T[]): T[] {
    return Array.from(new Set(list))
}

export function first<T>(list: T[]): T | undefined {
    return list[0]
}

export function last<T>(list: T[]): T | undefined {
    return list[list.length - 1]
}

export function reverse<T>(array: T[]): T[] {
    // eslint-disable-next-line fp/no-mutating-methods
    return array.slice().reverse()
}
