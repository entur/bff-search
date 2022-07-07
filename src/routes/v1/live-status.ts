import { Request, Router } from 'express'

import { Locale } from '../../utils/locale'
import { between } from '../../utils/random'
import { equalStatus, getLiveStatus, Status } from '../../logic/otp2/liveStatus'

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

            let eventId = 0
            let interval: NodeJS.Timer | undefined = undefined

            const closeStream = () => {
                if (interval) clearInterval(interval)
                res.end()
            }

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

            let status: Status | undefined = await getLiveStatus(
                serviceJourneyId,
                date,
                locale,
            )

            await updateLiveData(eventId, status)

            res.on('close', () => closeStream)

            interval = setInterval(async () => {
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
        } catch (error) {
            next(error)
        }
    },
)

export default router
