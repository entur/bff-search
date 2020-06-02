export function deriveSearchParamsId(tripPatternId: string): string {
    return tripPatternId.substring(0, 23)
}
