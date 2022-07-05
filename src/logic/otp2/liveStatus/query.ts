export default `
    query($id:String!,$date:Date!) {
        serviceJourney(id:$id) {
            estimatedCalls(date:$date) {
                quay {
                    name
                }
                realtime
                predictionInaccurate
                expectedArrivalTime
                expectedDepartureTime
                aimedArrivalTime
                aimedDepartureTime
                actualArrivalTime
                actualDepartureTime
                occupancyStatus
            }
        }
    }
    `.trim()
