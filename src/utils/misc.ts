export function isNotNullOrUndefined<T>(
    thing: T | null | undefined,
): thing is T {
    return thing !== null && thing !== undefined
}
