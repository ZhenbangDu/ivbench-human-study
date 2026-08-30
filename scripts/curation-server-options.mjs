export function curatorViteOptions(port) {
  const websocketPort = port <= 45_535 ? port + 20_000 : port - 20_000
  return {
    root: process.cwd(),
    appType: 'spa',
    server: {
      middlewareMode: true,
      ws: { port: websocketPort },
    },
  }
}
