import { SearchParams } from './types'

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
export class NotFoundError extends Error {}
export class InvalidArgumentError extends Error {}
export class JourneyPlannerError extends Error {}
