import { SearchParams, RoutingError } from './types'

export class TripPatternExpiredError extends Error {
    private searchParams: SearchParams

    public constructor(message: string, searchParams: SearchParams) {
        super()
        this.message = message
        this.searchParams = searchParams
    }

    public getSearchParams(): SearchParams {
        return this.searchParams
    }
}

export class RoutingErrorsError extends Error {
    private routingErrors: RoutingError[]

    public constructor(routingErrors: RoutingError[]) {
        super()
        this.message = 'Routing Errors'
        this.routingErrors = routingErrors
    }

    public getRoutingErrors(): RoutingError[] {
        return this.routingErrors
    }
}

export class NotFoundError extends Error {}
export class InvalidArgumentError extends Error {}
export class JourneyPlannerError extends Error {}
