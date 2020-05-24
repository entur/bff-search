import { findTimeZone, getZonedTime, getUTCOffset } from 'timezone-support'

interface Options {
    timeZone?: string
}
// Lifted from date-fns-timezone
export function convertToTimeZone(date: Date, options: Options): Date {
    if (!options.timeZone) return date
    const timeZone = findTimeZone(options.timeZone)
    const { offset } = getUTCOffset(date, timeZone)
    const localOffset = offset - date.getTimezoneOffset()
    return new Date(date.getTime() - localOffset * 60 * 1000)
}
