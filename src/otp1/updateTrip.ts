import {
    parseISO,
    addSeconds,
    addMinutes,
    subSeconds,
    differenceInSeconds,
    differenceInMinutes,
} from 'date-fns'
import createEnturService, { TripPattern, Leg, EstimatedCall } from '@entur/sdk'

import { first, last } from '../utils/array'
import { isFlexibleLeg, isTransitLeg } from '../utils/leg'
import { toISOString } from '../utils/time'

import { TRANSIT_HOST } from '../config'

const sdk = createEnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: TRANSIT_HOST,
    },
})

interface UpdatedEstimatedCall {
    quay: {
        id: string
        name: string
        timezone: string
    }
    realtime: boolean
    predictionInaccurate: boolean
    expectedArrivalTime: string
    expectedDepartureTime: string
    aimedArrivalTime: string
    aimedDepartureTime: string
    actualArrivalTime: string | undefined
    actualDepartureTime: string | undefined
    destinationDisplay: { frontText: string }
    notices: {
        id: string
    }
}
interface ServiceJourneyResponse {
    serviceJourney?: {
        estimatedCalls?: UpdatedEstimatedCall[]
    }
}
async function getCallsForServiceJourney(
    id: string,
    date: string,
): Promise<UpdatedEstimatedCall[]> {
    const query = `
    query($id:String!,$date:Date!) {
        serviceJourney(id:$id) {
            estimatedCalls(date:$date) {
                quay {
                    id
                    name
                    timezone
                }
                realtime
                predictionInaccurate
                expectedArrivalTime
                expectedDepartureTime
                aimedArrivalTime
                aimedDepartureTime
                actualDepartureTime
                actualArrivalTime
                destinationDisplay {
                    frontText
                }
                notices {
                    id
                }
            }
        }
    }
    `.trim()

    const data = await sdk.queryJourneyPlanner<ServiceJourneyResponse>(query, {
        id,
        date,
    })

    if (!data || !data.serviceJourney || !data.serviceJourney.estimatedCalls) {
        return Promise.reject('No service journey found')
    }

    return data.serviceJourney.estimatedCalls
}

function isSameCall(
    estimatedCall: UpdatedEstimatedCall,
    quayId: string,
    destinationFrontText?: string,
): boolean {
    const { quay, destinationDisplay } = estimatedCall
    return destinationFrontText
        ? quay.id === quayId &&
              destinationDisplay.frontText === destinationFrontText
        : quay.id === quayId
}

function findCallByQuayId(
    estimatedCalls: UpdatedEstimatedCall[],
    quayId: string,
    destinationFrontText?: string,
): UpdatedEstimatedCall | undefined {
    return estimatedCalls.find((call) =>
        isSameCall(call, quayId, destinationFrontText),
    )
}

function findCallIndexByQuayId(
    estimatedCalls: UpdatedEstimatedCall[],
    quayId: string,
    destinationFrontText?: string,
): number {
    return estimatedCalls.findIndex((call) =>
        isSameCall(call, quayId, destinationFrontText),
    )
}

function updateEstimatedCall(
    call: EstimatedCall,
    updatedCall?: UpdatedEstimatedCall,
): EstimatedCall {
    if (!updatedCall) return call

    const {
        realtime,
        predictionInaccurate,
        aimedDepartureTime,
        expectedDepartureTime,
        actualArrivalTime,
        actualDepartureTime,
        aimedArrivalTime,
        expectedArrivalTime,
    } = updatedCall

    return {
        ...call,
        realtime,
        predictionInaccurate,
        aimedDepartureTime,
        expectedDepartureTime,
        actualArrivalTime,
        actualDepartureTime,
        aimedArrivalTime,
        expectedArrivalTime,
    }
}
interface UpdatedCalls {
    fromCall: UpdatedEstimatedCall
    toCall: UpdatedEstimatedCall
    intermediateCalls: UpdatedEstimatedCall[]
}

interface LegWithUpdate {
    leg: Leg
    updatedCalls?: UpdatedCalls
}
async function updateLeg(leg: Leg): Promise<LegWithUpdate> {
    if (
        !leg.serviceJourney?.id ||
        !leg.fromEstimatedCall?.date ||
        !leg.toEstimatedCall
    ) {
        return { leg }
    }

    const { serviceJourney, fromEstimatedCall, toEstimatedCall } = leg
    const updatedEstimatedCalls = await getCallsForServiceJourney(
        serviceJourney.id,
        fromEstimatedCall.date,
    )

    const fromFrontText = fromEstimatedCall.destinationDisplay?.frontText
    const fromQuayId = fromEstimatedCall.quay?.id || ''
    const fromIndex = findCallIndexByQuayId(
        updatedEstimatedCalls,
        fromQuayId,
        fromFrontText,
    )
    const fromCall = updatedEstimatedCalls[fromIndex]
    if (!fromCall) return { leg }

    const toFrontText = toEstimatedCall.destinationDisplay?.frontText
    const toQuayId = toEstimatedCall.quay?.id || ''

    const remainingUpdatedCalls = updatedEstimatedCalls.slice(fromIndex + 1)

    const toIndex =
        findCallIndexByQuayId(remainingUpdatedCalls, toQuayId, toFrontText) +
        fromIndex +
        1
    const toCall = updatedEstimatedCalls[toIndex]
    if (!toCall) return { leg }

    const intermediateCalls = updatedEstimatedCalls.slice(
        fromIndex + 1,
        toIndex - 1,
    )

    return {
        leg,
        updatedCalls: { fromCall, toCall, intermediateCalls },
    }
}

function updateTransitLeg(leg: Leg, updatedCalls: UpdatedCalls): Leg {
    if (!updatedCalls) return leg
    const { fromEstimatedCall, toEstimatedCall, intermediateEstimatedCalls } =
        leg

    const { fromCall, toCall, intermediateCalls } = updatedCalls

    const { expectedDepartureTime: expectedStartTime } = fromCall
    const { expectedArrivalTime: expectedEndTime } = toCall
    const duration = differenceInSeconds(
        parseISO(expectedEndTime),
        parseISO(expectedStartTime),
    )
    const realtime =
        fromCall.realtime &&
        toCall.realtime &&
        intermediateCalls.every((call) => call.realtime)

    const updatedFromEstimatedCall =
        fromEstimatedCall && updateEstimatedCall(fromEstimatedCall, fromCall)
    const updatedToEstimatedCall =
        toEstimatedCall && updateEstimatedCall(toEstimatedCall, toCall)

    const updatedIntermediateEstimatedCalls = intermediateEstimatedCalls.map(
        (call) => {
            if (!call.quay || !call.quay.id) return call
            const frontText = call.destinationDisplay?.frontText
            const quayId = call.quay.id
            const updatedCall = findCallByQuayId(
                intermediateCalls,
                quayId,
                frontText,
            )
            return updateEstimatedCall(call, updatedCall)
        },
    )

    return {
        ...leg,
        duration,
        realtime,
        expectedStartTime,
        expectedEndTime,
        fromEstimatedCall: updatedFromEstimatedCall,
        toEstimatedCall: updatedToEstimatedCall,
        intermediateEstimatedCalls: updatedIntermediateEstimatedCalls,
    }
}

function updateNonTransitLeg(
    leg: Leg,
    next?: LegWithUpdate,
    prev?: LegWithUpdate,
): Leg {
    const { duration = 0 } = leg

    if (prev) {
        const { updatedCalls } = prev
        if (!updatedCalls) return leg

        const { toCall } = updatedCalls
        const { expectedArrivalTime: expectedStartTime, quay } = toCall
        const { timezone: timeZone } = quay

        const expectedEndTime = toISOString(
            addSeconds(parseISO(expectedStartTime), duration),
            { timeZone },
        )
        return { ...leg, expectedStartTime, expectedEndTime }
    }

    if (next) {
        const { updatedCalls } = next
        if (!updatedCalls) return leg

        const { fromCall } = updatedCalls
        const { expectedDepartureTime: expectedEndTime, quay } = fromCall
        const { timezone: timeZone } = quay

        const expectedStartTime = toISOString(
            subSeconds(parseISO(expectedEndTime), duration),
            { timeZone },
        )
        return { ...leg, expectedStartTime, expectedEndTime }
    }

    return leg
}

function mergeLegsWithUpdateInfo(legsWithUpdate: LegWithUpdate[]): Leg[] {
    return legsWithUpdate.map(({ leg, updatedCalls }, index) => {
        if (!isTransitLeg(leg)) {
            const next = legsWithUpdate[index + 1]
            const prev = legsWithUpdate[index - 1]
            return updateNonTransitLeg(leg, next, prev)
        }
        if (!updatedCalls) return leg
        return updateTransitLeg(leg, updatedCalls)
    })
}

export async function updateTripPattern(
    tripPattern: TripPattern,
): Promise<TripPattern> {
    if (tripPattern.legs.some(isFlexibleLeg)) return tripPattern

    const { legs, startTime, endTime, duration } = tripPattern

    const legsWithUpdateInfo = await Promise.all(
        legs.map((leg) => updateLeg(leg).catch(() => ({ leg }))),
    )
    const updatedLegs = mergeLegsWithUpdateInfo(legsWithUpdateInfo)

    const { expectedStartTime: updatedStartTime = startTime } =
        first(updatedLegs) || {}
    const { expectedEndTime: updatedEndTime = endTime } =
        last(updatedLegs) || {}
    const updatedDuration =
        updatedStartTime && updatedEndTime
            ? differenceInSeconds(parseISO(endTime), parseISO(startTime))
            : duration

    return {
        ...tripPattern,
        startTime: updatedStartTime,
        endTime: updatedEndTime,
        duration: updatedDuration,
        legs: updatedLegs,
    }
}

export function getExpires(tripPattern: TripPattern): Date | undefined {
    const now = new Date()
    const startTime = parseISO(tripPattern.startTime)
    const endTime = parseISO(tripPattern.endTime)

    // trip has ended
    if (endTime < now) return

    const minutesToStart = differenceInMinutes(startTime, now)
    if (minutesToStart < 10) return addSeconds(now, 30)
    if (minutesToStart < 60) return addMinutes(now, 2)
    if (minutesToStart < 120) return addMinutes(now, 10)
}
