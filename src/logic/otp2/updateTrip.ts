import {
    parseISO,
    addSeconds,
    addMinutes,
    subSeconds,
    differenceInSeconds,
    differenceInMinutes,
} from 'date-fns'

import { first, last } from '../../utils/array'
import { isFlexibleLeg, isTransitLeg } from '../../utils/leg'
import { toISOString } from '../../utils/time'

import logger from '../../logger'

import { TripPattern, Leg, ExtraHeaders } from '../../types'

import { getLeg } from './leg'
import { LegFieldsFragment } from '../../generated/graphql'

function updateNonTransitLeg(leg: Leg, next?: Leg, prev?: Leg): Leg {
    const duration = leg.duration || 0

    if (prev) {
        const { expectedEndTime: expectedStartTime } = prev

        const expectedEndTime = toISOString(
            addSeconds(parseISO(expectedStartTime), duration),
            { timeZone: 'Europe/Oslo' },
        )
        return { ...leg, expectedStartTime, expectedEndTime }
    }

    if (next) {
        const { expectedStartTime: expectedEndTime } = next

        const expectedStartTime = toISOString(
            subSeconds(parseISO(expectedEndTime), duration),
            { timeZone: 'Europe/Oslo' },
        )

        return { ...leg, expectedStartTime, expectedEndTime }
    }

    return leg
}

const getLegComment = 'get leg for updateTripPattern'
export async function updateTripPattern(
    tripPattern: TripPattern,
    extraHeaders: ExtraHeaders,
): Promise<TripPattern> {
    if (tripPattern.legs.some(isFlexibleLeg)) return tripPattern

    const {
        legs,
        expectedStartTime: startTime,
        expectedEndTime: endTime,
        duration,
    } = tripPattern

    const updatedTransitLegs: LegFieldsFragment[] = await Promise.all(
        legs.map((oldLeg) =>
            oldLeg.id
                ? getLeg(oldLeg.id, extraHeaders, getLegComment).catch(
                      (error) => {
                          logger.warning('Failed to update leg', error)
                          return oldLeg
                      },
                  )
                : Promise.resolve(oldLeg),
        ),
    )

    const updatedLegs = updatedTransitLegs.map((leg, index, arr) =>
        !isTransitLeg(leg)
            ? updateNonTransitLeg(leg, arr[index + 1], arr[index - 1])
            : leg,
    )

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
    const startTime = parseISO(tripPattern.expectedStartTime)
    const endTime = parseISO(tripPattern.expectedEndTime)

    // trip has ended
    if (endTime < now) return

    const minutesToStart = differenceInMinutes(startTime, now)
    if (minutesToStart < 10) return addSeconds(now, 30)
    if (minutesToStart < 60) return addMinutes(now, 2)
    if (minutesToStart < 120) return addMinutes(now, 10)
}
