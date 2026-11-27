const backendPath = /^\/(?:functions\/v1|rest\/v1|api|tv)(?:\/|$)/;

export default {
  fetch(request, env) {
    if (!backendPath.test(new URL(request.url).pathname)) return env.ASSETS.fetch(request);
    if (!env.QUEUE_BACKEND) {
      return Response.json({ code: 'BACKEND_UNAVAILABLE' }, {
        status: 503, headers: { 'Cache-Control': 'no-store' },
      });
    }
    return env.QUEUE_BACKEND.fetch(request);
  },
};
