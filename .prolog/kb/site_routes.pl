% The main-site Vite build emits radar.html; the server maps the clean URL.
static_route('/radar', 'radar.html').
static_route('/radar/stream', server_sent_events).
