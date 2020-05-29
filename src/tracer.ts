import { PluginTypes, start as startTracer } from '@google-cloud/trace-agent'

let tracer: PluginTypes.Tracer

if (startTracer && process.env.NODE_ENV === 'production') {
    tracer = startTracer()
}

export default function trace(name: string): () => void {
    let span: PluginTypes.Span

    if (tracer) {
        span = tracer.createChildSpan({ name })
    }

    return () => {
        if (span) {
            span.endSpan()
        }
    }
}
