import {
    GetTripPatternsQueryVariables,
    RoutingError,
    RoutingErrorCode,
} from '../../generated/graphql'
import { RoutingErrorsError } from '../../errors'
import { getTripPatternsQuery } from './helpers'

// There is no point in continuing the search if any of these routing errors
// are received
const HOPELESS_ROUTING_ERRORS = [
    RoutingErrorCode.OutsideServicePeriod,
    RoutingErrorCode.OutsideBounds,
    RoutingErrorCode.LocationNotFound,
    RoutingErrorCode.WalkingBetterThanTransit,
    RoutingErrorCode.SystemError,
]

export function hasHopelessRoutingError(
    routingErrors: RoutingError[],
): boolean {
    return routingErrors.some(({ code }) =>
        HOPELESS_ROUTING_ERRORS.includes(code),
    )
}

export function verifyRoutingErrors(
    routingErrors: RoutingError[],
    params: GetTripPatternsQueryVariables,
): void {
    if (hasHopelessRoutingError(routingErrors)) {
        throw new RoutingErrorsError(routingErrors, [
            getTripPatternsQuery(params, 'Routing error'),
        ])
    }
}
