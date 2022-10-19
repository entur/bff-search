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

export class GetTripPatternError extends Error {
    private error: Error
    private query: GraphqlQuery

    public constructor(error: Error, query: GraphqlQuery) {
        super()
        this.message = 'Error while searching for trip patterns'
        this.error = error
        this.query = query
    }

    public getError(): Error {
        return this.error
    }

    public getQuery(): GraphqlQuery {
        return this.query
    }
}

export class NotFoundError extends Error {}
export class InvalidArgumentError extends Error {}
