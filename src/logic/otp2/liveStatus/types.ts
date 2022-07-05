import { OccupancyStatus } from '../../../generated/graphql'

export interface Status {
    text: string
    isDelayed: boolean
    occupancyStatus: OccupancyStatus
}

export interface EstimatedCall {
    quay?: {
        name: string
    }
    realtime: boolean
    expectedArrivalTime: string
    expectedDepartureTime: string
    aimedArrivalTime: string
    aimedDepartureTime: string
    actualArrivalTime: string | null
    actualDepartureTime: string | null
    predictionInaccurate: boolean
    occupancyStatus: OccupancyStatus
}
