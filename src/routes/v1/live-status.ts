import { Request, Router } from 'express'

import { Locale } from '../../utils/locale'
import { between } from '../../utils/random'
import { equalStatus, getLiveStatus, Status } from '../../logic/otp2/liveStatus'
import { addMinutes, isAfter } from 'date-fns'

const router = Router()

const STREAM_TIMEOUT = 30 // minutes

type EventType = 'live-status' | 'close' | 'timeout'

function createEvent<T>(id: number, type: EventType, data?: T): string {
    const serializedData = data ? JSON.stringify(data) : ''

    return `event:${type}\nid:${id}\ndata:${serializedData}\n\n`
}

router.get(
    '/:serviceJourneyId',
    async (
        req: Request<
            { serviceJourneyId: string },
            Record<string, never>,
            Record<string, never>,
            { date: string; locale?: Locale }
        >,
        res,
        next,
    ) => {
        try {
            const serviceJourneyId = req.params.serviceJourneyId
            const { date, locale } = req.query

            res.set({
                'Cache-Control': 'no-cache',
                'Content-Type': 'text/event-stream',
                Connection: 'keep-alive',
            })
            res.flushHeaders()

            let eventId = 0
            let interval: NodeJS.Timer | undefined = undefined
            const streamEndTime = addMinutes(new Date(), STREAM_TIMEOUT)

            const closeStream = (): void => {
                if (interval) clearInterval(interval)
                res.end()
            }

            const timeoutEvent = (id: number): void => {
                const event = createEvent(id, 'timeout')
                res.write(event)
                closeStream()
            }

            const closeEvent = (id: number): void => {
                const event = createEvent(id, 'close')
                res.write(event)
                closeStream()
            }

            const liveStatusEvent = (
                id: number,
                updatedStatus: Status,
            ): void => {
                const event = createEvent(id, 'live-status', {
                    status: updatedStatus,
                })

                res.write(event)
            }

            let status = await getLiveStatus(serviceJourneyId, date, locale)

            if (status) liveStatusEvent(eventId, status)
            else closeEvent(eventId)

            res.on('close', closeStream)

            interval = setInterval(async () => {
                if (isAfter(new Date(), streamEndTime))
                    return timeoutEvent(eventId)

                const newStatus = await getLiveStatus(
                    serviceJourneyId,
                    date,
                    locale,
                )
                if (eventId > 0 && newStatus && equalStatus(newStatus, status))
                    return

                status = newStatus
                eventId++

                if (status) liveStatusEvent(eventId, status)
                else closeEvent(eventId)
            }, between(2500, 3000))
        } catch (error) {
            next(error)
        }
    },
)

export default router
