import http, { IncomingMessage, ServerResponse } from 'http'
import logger from './logger'

// Minimal HTTP server that accepts any calls, used for keepalive, to prevent idle timeouts.
const httpServer = http.createServer(
    (request: IncomingMessage, response: ServerResponse) => {
        logger.debug(`Received http request to ${request.url}`)
        response.setHeader('Content-Type', 'text/html')
        response.writeHead(200)
        response.end('pong')
    },
)

export default (port = process.env.PORT || 80): void => {
    logger.info(`Starting http server`)
    httpServer.listen(port, () => {
        logger.info(`Server is running on port ${port}`)
    })
}
