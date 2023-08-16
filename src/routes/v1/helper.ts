import { Request } from 'express'
import { clean } from '../../utils/object'

import { ExtraHeaders } from '../../types'

export function getHeadersFromClient(req: Request): ExtraHeaders {
    return clean({
        'entur-pos': req.get('entur-pos'),
        'X-Correlation-Id': req.get('X-Correlation-Id'),
        'ET-Client-Name': 'entur-search',
    })
}
