import { Request } from 'express'
import { clean } from '../../utils/object'

import { ExtraHeaders } from '../../types'

export function getHeadersFromClient(req: Request): ExtraHeaders {
    return clean({
        'X-Correlation-Id': req.get('X-Correlation-Id'),
        'ET-Client-Name': 'entur-search',
    })
}
