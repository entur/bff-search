import { EstimatedCall, Status } from './types'
import { differenceInMinutes, differenceInSeconds, parseISO } from 'date-fns'
import { first, last, reverse } from '../../../utils/array'

import { I18n } from '../../../utils/locale'
import { formatDateAsTime } from '../../../utils/time'
import * as texts from './texts'
import { OccupancyStatus } from '../../../generated/graphql'

const LIVE_STATUS_MINUTES_BEFORE_DEPARTURE = 30
const LIVE_STATUS_MINUTES_AFTER_ARRIVAL = 30

export function createLiveStatus(
    estimatedCalls: EstimatedCall[],
    i18n: I18n,
): Status | undefined {
    const currentTime = new Date()
    const firstCall = first(estimatedCalls)
    const lastCall = last(estimatedCalls)
    const expectedToDepart = (call: EstimatedCall): boolean => {
        return (
            differenceInSeconds(
                parseISO(call.expectedDepartureTime),
                currentTime,
            ) >= 0
        )
    }

    const expectedToArrive = (call: EstimatedCall): boolean => {
        return (
            differenceInSeconds(
                parseISO(call.expectedArrivalTime),
                currentTime,
            ) >= 0
        )
    }

    const minutesAfterArrival = (call: EstimatedCall): number => {
        return differenceInMinutes(
            currentTime,
            parseISO(
                call.actualArrivalTime ||
                    call.expectedArrivalTime ||
                    call.aimedArrivalTime,
            ),
        )
    }

    const minutesBeforeDeparture = (call: EstimatedCall): number => {
        return differenceInMinutes(
            parseISO(
                call.actualDepartureTime ||
                    call.expectedDepartureTime ||
                    call.aimedDepartureTime,
            ),
            currentTime,
        )
    }

    if (
        !firstCall ||
        !lastCall ||
        minutesBeforeDeparture(firstCall) >=
            LIVE_STATUS_MINUTES_BEFORE_DEPARTURE ||
        minutesAfterArrival(lastCall) >= LIVE_STATUS_MINUTES_AFTER_ARRIVAL
    ) {
        return
    }

    if (isValidRealtime(lastCall) && lastCall.actualArrivalTime) {
        return getArrivedStatus(lastCall, i18n)
    }

    const arrivedStop = reverse(estimatedCalls.slice(1, -1)).find(
        (call) =>
            isValidRealtime(call) &&
            call.actualArrivalTime &&
            !call.actualDepartureTime,
    )

    if (arrivedStop) {
        return getArrivedStopStatus(arrivedStop, i18n)
    }

    const passedStop = reverse(estimatedCalls.slice(0, -1)).find(
        (call) =>
            isValidRealtime(call) &&
            call.actualDepartureTime &&
            parseISO(call.actualDepartureTime) < currentTime,
    )

    if (passedStop) {
        return getPassedStopStatus(passedStop, i18n)
    }

    if (isValidRealtime(firstCall) && expectedToDepart(firstCall)) {
        return getInitialDepartureStatus(firstCall, i18n)
    }

    if (minutesAfterArrival(lastCall) >= 0) return

    const expectedNextStop = estimatedCalls
        .slice(1)
        .find((call) => isValidRealtime(call) && expectedToArrive(call))

    const expectedPassedStop = estimatedCalls
        .slice(0, -1)
        .find((call) => isValidRealtime(call) && !expectedToDepart(call))

    if (expectedNextStop || expectedPassedStop) {
        return getDelayStatus(i18n, expectedNextStop, expectedPassedStop)
    }
}

export function equalStatus(a?: Status, b?: Status): boolean {
    if (!a || !b) return false

    return a.text === b.text && a.isDelayed === b.isDelayed
}

export function filterRealtimeData(calls: EstimatedCall[]): EstimatedCall[] {
    const hasSuspiciousDepartureTimes = calls.some((call, index) => {
        const nextCall = calls[index + 1]
        if (!nextCall) return false

        const {
            actualDepartureTime,
            aimedDepartureTime,
            expectedDepartureTime,
        } = call
        return isSuddenlyDelayed(
            aimedDepartureTime,
            expectedDepartureTime,
            actualDepartureTime ?? undefined,
            nextCall.aimedDepartureTime,
            nextCall.expectedDepartureTime,
        )
    })

    const hasSuspiciousArrivalTimes = calls.some((call, index) => {
        const nextCall = calls[index + 1]
        if (!nextCall) return false

        const { actualArrivalTime, aimedArrivalTime, expectedArrivalTime } =
            call
        return isSuddenlyDelayed(
            aimedArrivalTime,
            expectedArrivalTime,
            actualArrivalTime ?? undefined,
            nextCall.aimedArrivalTime,
            nextCall.expectedArrivalTime,
        )
    })

    return calls.map((call) => {
        return {
            ...call,
            actualDepartureTime: !hasSuspiciousDepartureTimes
                ? call.actualDepartureTime
                : null,
            actualArrivalTime: !hasSuspiciousArrivalTimes
                ? call.actualArrivalTime
                : null,
        }
    })
}

function getInitialDepartureStatus(call: EstimatedCall, i18n: I18n): Status {
    const departureTime = getExpectedDepartureTime(call)
    const departureDelay = getDepartureDelay(call)
    const fromName = getName(call)
    const isDelayed = departureDelay > 0

    const status = i18n(
        !isDelayed ? texts.onTime : texts.minutesDelayed(departureDelay),
    )
    const details = i18n(texts.departure(fromName, departureTime))

    return {
        text: `${status} · ${details}`,
        isDelayed,
        occupancyStatus: call.occupancyStatus,
    }
}

function getDelayStatus(
    i18n: I18n,
    nextCall?: EstimatedCall,
    passedCall?: EstimatedCall,
): Status {
    const expectedDelay = nextCall
        ? getArrivalDelay(nextCall)
        : getDepartureDelay(passedCall as EstimatedCall)
    const isDelayed = expectedDelay > 0

    return {
        text: i18n(
            !isDelayed ? texts.onTime : texts.minutesDelayed(expectedDelay),
        ),
        isDelayed,
        occupancyStatus: passedCall?.occupancyStatus || OccupancyStatus.NoData,
    }
}

function isValidRealtime(call: EstimatedCall): boolean {
    return Boolean(call.realtime && !call.predictionInaccurate)
}

function getArrivedStatus(call: EstimatedCall, i18n: I18n): Status {
    const arrivalTime = getArrivalTime(call)
    const arrivalDelay = getArrivalDelay(call)
    const toName = getName(call)
    const isDelayed = arrivalDelay > 0

    const status = i18n(
        !isDelayed ? texts.onTime : texts.minutesDelayed(arrivalDelay),
    )
    const details = i18n(texts.arrival(toName, arrivalTime))

    return {
        text: `${status} · ${details}`,
        isDelayed,
        occupancyStatus: call.occupancyStatus,
    }
}

function getArrivedStopStatus(call: EstimatedCall, i18n: I18n): Status {
    const arrivedStopDelay = getArrivalDelay(call)
    const arrivedStopTime = getArrivalTime(call)
    const arrivedStopName = getName(call)
    const isDelayed = arrivedStopDelay > 0

    const status = i18n(
        !isDelayed ? texts.onTime : texts.minutesDelayed(arrivedStopDelay),
    )
    const details = i18n(texts.arrivedStop(arrivedStopName, arrivedStopTime))

    return {
        text: `${status} · ${details}`,
        isDelayed,
        occupancyStatus: call.occupancyStatus,
    }
}

function getPassedStopStatus(call: EstimatedCall, i18n: I18n): Status {
    const passedStopDelay = getDepartureDelay(call)
    const passedStopName = getName(call)
    const passedStopTime = getActualDepartureTime(call)
    const isDelayed = passedStopDelay > 0

    const status = i18n(
        !isDelayed ? texts.onTime : texts.minutesDelayed(passedStopDelay),
    )
    const details = i18n(texts.passedStop(passedStopName, passedStopTime))

    return {
        text: `${status} · ${details}`,
        isDelayed,
        occupancyStatus: call.occupancyStatus,
    }
}

function getArrivalTime(call: EstimatedCall): string {
    const arrivalDate = parseISO(call.actualArrivalTime as string)
    return formatDateAsTime(arrivalDate)
}

function getActualDepartureTime(call: EstimatedCall): string {
    const departureDate = parseISO(call.actualDepartureTime as string)
    return formatDateAsTime(departureDate)
}

function getExpectedDepartureTime(call: EstimatedCall): string {
    const departureDate = parseISO(call.expectedDepartureTime)
    return formatDateAsTime(departureDate)
}

function getArrivalDelay(call: EstimatedCall): number {
    const delayInSeconds = differenceInSeconds(
        parseISO(call.actualArrivalTime || call.expectedArrivalTime),
        parseISO(call.aimedArrivalTime),
    )
    return convertToMinuteDelay(delayInSeconds)
}

function getDepartureDelay(call: EstimatedCall): number {
    const delayInSeconds = differenceInSeconds(
        parseISO(call.actualDepartureTime || call.expectedDepartureTime),
        parseISO(call.aimedDepartureTime),
    )
    return convertToMinuteDelay(delayInSeconds)
}

function getName(call: EstimatedCall): string {
    return call.quay?.name || ''
}

function isSuddenlyDelayed(
    aimedTimeA: string,
    expectedTimeA: string,
    actualTimeA: string | undefined,
    aimedTimeB: string,
    expectedTimeB: string,
): boolean {
    const secondsDuration = differenceInSeconds(
        parseISO(aimedTimeB),
        parseISO(aimedTimeA),
    )
    const secondsDelay = differenceInSeconds(
        parseISO(expectedTimeB),
        parseISO(aimedTimeB),
    )
    return (
        aimedTimeA === expectedTimeA &&
        aimedTimeA === actualTimeA &&
        convertToMinuteDelay(secondsDelay) > 0 &&
        secondsDelay >= secondsDuration
    )
}

const TransportTimeDelays = {
    SMALL: 2,
    LARGE: 6,
}

function convertToMinuteDelay(seconds = 0): number {
    const minutes = Math.floor(seconds / 60)
    const minuteResidue = seconds - 60 * minutes > 45 ? 1 : 0
    const total = minutes + minuteResidue
    return total >= TransportTimeDelays.SMALL ? total : 0
}
