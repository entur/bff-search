import { Request, Router } from 'express'

import { Locale } from '../../utils/locale'
import { between } from '../../utils/random'
import { getLiveStatus, Status, equalStatus } from '../../logic/otp2/liveStatus'

const router = Router()

type EventType = 'live-status' | 'close'

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

            const updateLiveData = (
                id: number,
                updatedStatus?: Status,
            ): void => {
                const event = updatedStatus
                    ? createEvent(id, 'live-status', { status: updatedStatus })
                    : createEvent(eventId, 'close')

                res.write(event)
                if (!updatedStatus) closeStream()
            }
            const closeStream = (): void => {
                clearInterval(interval)
                res.end()
            }

            let status: Status | undefined = await getLiveStatus(
                serviceJourneyId,
                date,
                locale,
            )

            let eventId = 0
            await updateLiveData(eventId, status)

            const interval = setInterval(async () => {
                const newStatus = await getLiveStatus(
                    serviceJourneyId,
                    date,
                    locale,
                )
                if (eventId > 0 && newStatus && equalStatus(newStatus, status))
                    return

                status = newStatus
                eventId++

                updateLiveData(eventId, status)
            }, between(2500, 3000))

            res.on('close', () => closeStream())
        } catch (error) {
            next(error)
        }
    },
)

export default router
