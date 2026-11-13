# CastFlow – cast local videos to your TV over Wi-Fi

React + TypeScript + Tailwind dashboard, Node.js companion service (HTTP Range streaming, WebSocket, mDNS + SSDP discovery, optional FFmpeg).

## Why a companion service?
A web page cannot discover TVs, open UDP sockets or serve multi-GB files. The Node service in `server/` does that; the dashboard in `web/` is its control panel.

## Run
```bash
npm run install:all
npm run build        # builds web/dist
npm start            # http://localhost:8787  (also http://<computer-ip>:8787 from phones)
```
Optional: install FFmpeg (transcoding, thumbnails, subtitles). Set `CASTFLOW_MEDIA=/path/one:/path/two` to pick library folders.
Dev: `npm run dev:server` and `npm run dev:web` (http://localhost:5173).
Firewall: allow Node.js on TCP 8787 and UDP 1900/5353.

## Ways to connect to a TV
| Method | TV needs | Controls |
|---|---|---|
| Google Cast (Chromecast, Google TV, Android TV) | nothing, found via mDNS | play/pause/seek/volume |
| DLNA / UPnP renderer | DLNA enabled (found via SSDP) | play/pause/seek/volume |
| **CastFlow receiver** | open `http://<computer-ip>:8787/receiver` in the TV browser, type the 6-digit code | all of the above + subtitles + screen mirroring (WebRTC) |
| By IP | unicast SSDP / Cast port probe | as above |

## Streaming
- Files from library folders: served from disk with HTTP 206 Range, never loaded into RAM (tested with a 6 GB file, seeking to the end).
- Files picked in a browser (laptop or phone): **browser relay**. The TV asks for a byte range, the service asks that browser tab for exactly that slice over the local WebSocket and forwards it. No upload, no size limit, nothing stored. Keep the tab open.
- Unsupported codecs/containers or lower quality: fragmented-MP4 transcode with FFmpeg (Settings → Transcoding).

## Honesty rules
The UI shows "TV Connected" only after the backend handshake succeeds, and "playing" only when the TV itself reports it. Lost connections go to "Reconnecting…" and playback resumes from the saved position.

## Limits
Screen mirroring needs the receiver page and a desktop browser (phones cannot capture the screen). Transcoded streams seek by restarting FFmpeg. Subtitles on Cast/DLNA are not supported (receiver only). Cast/DLNA behavior varies by TV model; test on your own TV.
