import { SearchParams, RoutingError, GraphqlQuery } from './types'

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
    private queries: GraphqlQuery[]

    public constructor(routingErrors: RoutingError[], queries: GraphqlQuery[]) {
        super()
        this.message = 'Routing Errors'
        this.routingErrors = routingErrors
        this.queries = queries
    }

    public getRoutingErrors(): RoutingError[] {
        return this.routingErrors
    }

    public getQueries(): GraphqlQuery[] {
        return this.queries
    }
}

export class NotFoundError extends Error {}
export class InvalidArgumentError extends Error {}
export class JourneyPlannerError extends Error {}
