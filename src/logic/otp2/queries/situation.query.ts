import { gql } from 'graphql-request'

export default gql`
    query situation($situationNumber: String!) {
        situation(situationNumber: $situationNumber) {
            situationNumber
            reportType
            summary {
                language
                value
            }
            description {
                language
                value
            }
            advice {
                language
                value
            }
            validityPeriod {
                startTime
                endTime
            }
            infoLinks {
                uri
                label
            }
            stopPlaces {
                id
                name
            }
            affects {
                __typename
                ... on AffectedLine {
                    line {
                        id
                    }
                }
                ... on AffectedStopPlace {
                    stopPlace {
                        id
                        name
                    }
                    quay {
                        id
                        name
                    }
                }
                ... on AffectedServiceJourney {
                    serviceJourney {
                        id
                    }
                }
                ... on AffectedStopPlaceOnServiceJourney {
                    stopPlace {
                        id
                        name
                    }
                    quay {
                        id
                        name
                    }
                }
                ... on AffectedStopPlaceOnLine {
                    stopPlace {
                        id
                        name
                    }
                    quay {
                        id
                        name
                    }
                }
            }
        }
    }
`
