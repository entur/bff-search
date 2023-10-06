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

type Primitive = string | number | boolean | undefined
export function uniq<T extends Primitive>(list: T[]): T[] {
    return Array.from(new Set(list))
}

export function uniqBy<T, V>(array: T[], iteratee: (item: T) => V): T[] {
    const uniqMap = array.reduce((map, item) => {
        const key = iteratee(item)
        if (map.has(key)) return map
        map.set(key, item)
        return map
    }, new Map<V, T>())

    return [...uniqMap.values()]
}

export function first<T>(list: T[]): T | undefined {
    return list[0]
}

export function last<T>(list: T[]): T | undefined {
    return list[list.length - 1]
}
