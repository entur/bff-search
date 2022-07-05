import { findTimeZone, getZonedTime } from 'timezone-support'
import { addMinutes, format, startOfMinute } from 'date-fns'

function pad(num = 0): string {
    return String(num).padStart(2, '0')
}

// Lifted from timezone-support/dist/parse-format
function formatOffset(offset = 0): string {
    if (!offset) return 'Z'
    const sign = offset < 0 ? '+' : '-'
    const absOffset = Math.abs(offset)
    const hours = Math.floor(absOffset / 60)
    const minutes = Math.floor(absOffset % 60)
    return `${sign}${pad(hours)}:${pad(minutes)}`
}

interface Options {
    timeZone?: string
}
export function toISOString(date: Date, options: Options): string {
    if (!options.timeZone) return date.toISOString()
    const timeZone = findTimeZone(options.timeZone)
    const { year, month, day, hours, minutes, seconds, zone } = getZonedTime(
        date,
        timeZone,
    )
    const offset = zone?.offset
    return `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(
        minutes,
    )}:${pad(seconds)}${formatOffset(offset)}`
}

/**
 * Time format
 * ex. 11:15
 */
const TIME_FORMAT = 'HH:mm'

export function formatDateAsTime(date: Date): string {
    const roundedDate = roundDate(date)
    return format(roundedDate, TIME_FORMAT)
}

function roundDate(date: Date): Date {
    if (date.getSeconds() < 45) return startOfMinute(date)
    return startOfMinute(addMinutes(date, 1))
}
