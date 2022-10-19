export function uniq<T>(list: T[]): T[] {
    return Array.from(new Set(list))
}

export function first<T>(list: T[]): T | undefined {
    return list[0]
}

export function last<T>(list: T[]): T | undefined {
    return list[list.length - 1]
}
