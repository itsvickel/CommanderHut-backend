const HEARTBEAT_MS = 15_000;

/**
 * Opens a Server-Sent Events stream on a POST response.
 * Sends comment-only heartbeats so proxies don't idle out long generations,
 * and reports client disconnects so callers can stop writing.
 */
export function openSseStream(req, res, { heartbeatMs = HEARTBEAT_MS } = {}) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let clientGone = false;

  const stop = () => clearInterval(heartbeat);

  // A socket can die before 'close' fires; treat any write failure as a
  // disconnect rather than letting it surface as an unhandled error.
  const write = (chunk) => {
    if (clientGone) return;
    try {
      res.write(chunk);
    } catch {
      clientGone = true;
      stop();
    }
  };

  const heartbeat = setInterval(() => write(': ping\n\n'), heartbeatMs);
  // Don't hold the event loop open on shutdown.
  heartbeat.unref?.();

  res.on('error', () => { clientGone = true; stop(); });
  req.on('close', () => { clientGone = true; stop(); });

  return {
    emit(event, data) {
      write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    isClientGone: () => clientGone,
    end() {
      stop();
      if (!clientGone) res.end();
    },
  };
}
