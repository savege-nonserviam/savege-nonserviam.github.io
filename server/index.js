import 'dotenv/config'

import express from 'express'
import { createServer } from 'node:http'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'

const PORT = Number(process.env.PORT ?? 3001)
const ROOM_IDLE_TTL_MS = 10 * 60 * 1000
const EMPTY_ROOM_DELETE_DELAY_MS = 0
const OWNER_GRACE_MS = 12 * 1000
const MAX_MESSAGES = 80
const MAX_SEARCH_RESULTS = 10
const YOUTUBE_SEARCH_FETCH_LIMIT = 20
const PLAYBACK_END_BUFFER_SECONDS = 0.75
const STALE_PLAYBACK_RESET_GRACE_SECONDS = 30
const MAX_OWNER_EVENT_AGE_MS = 15 * 1000
const MAX_OWNER_EVENT_FUTURE_MS = 1000
const OWNER_EVENT_REORDER_GRACE_MS = 1200
const MAX_CHAT_BODY_LENGTH = 400
const MEMBER_COLORS = ['#ff5d5d', '#f7c948', '#58d7b4', '#78a6ff', '#d58cff', '#ff9b6a']
const DEFAULT_CORS_ORIGINS = ['https://savege-nonserviam.github.io']
const EMOJI_SHORTCODES = new Map([
  ['smile', '🙂'],
  ['happy', '🙂'],
  ['grin', '😀'],
  ['grinning', '😀'],
  ['joy', '😂'],
  ['laugh', '😂'],
  ['lol', '😂'],
  ['rofl', '🤣'],
  ['lmao', '🤣'],
  ['wink', '😉'],
  ['blush', '😊'],
  ['cute', '😊'],
  ['heart', '❤️'],
  ['love', '❤️'],
  ['fire', '🔥'],
  ['lit', '🔥'],
  ['clap', '👏'],
  ['applause', '👏'],
  ['thumbsup', '👍'],
  ['thumbs_up', '👍'],
  ['+1', '👍'],
  ['thumbsdown', '👎'],
  ['thumbs_down', '👎'],
  ['-1', '👎'],
  ['ok', '👌'],
  ['ok_hand', '👌'],
  ['pray', '🙏'],
  ['please', '🙏'],
  ['party', '🥳'],
  ['partying', '🥳'],
  ['eyes', '👀'],
  ['sob', '😭'],
  ['cry', '😭'],
  ['angry', '😡'],
  ['mad', '😡'],
  ['skull', '💀'],
  ['dead', '💀'],
  ['cool', '😎'],
  ['sunglasses', '😎'],
  ['thinking', '🤔'],
  ['think', '🤔'],
  ['wave', '👋'],
  ['hello', '👋'],
  ['rocket', '🚀'],
  ['star', '⭐'],
  ['check', '✅'],
  ['done', '✅'],
  ['x', '❌'],
  ['cross', '❌'],
  ['warning', '⚠️'],
  ['warn', '⚠️'],
  ['popcorn', '🍿'],
  ['100', '💯'],
  ['hundred', '💯'],
  ['sparkles', '✨'],
  ['shine', '✨'],
  ['coffee', '☕'],
  ['music', '🎵'],
  ['note', '🎵'],
  ['crown', '👑'],
])

const app = express()
const httpServer = createServer(app)
const configuredCorsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : []
const corsOrigins = Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...configuredCorsOrigins]))

const io = new Server(httpServer, {
  cors: { origin: corsOrigins, credentials: true },
})

const rooms = new Map()

app.disable('x-powered-by')
app.use((request, response, next) => {
  const origin = request.headers.origin

  if (corsOrigins?.length && origin && corsOrigins.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    response.setHeader('Vary', 'Origin')
  }

  if (request.method === 'OPTIONS') {
    response.sendStatus(204)
    return
  }

  next()
})
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'YouWatch', serverTime: Date.now() })
})

app.get('/api/youtube/oembed', async (request, response) => {
  const videoId = validateYouTubeId(String(request.query.videoId ?? ''))

  if (!videoId) {
    response.status(400).json({ message: 'A valid YouTube video id is required.' })
    return
  }

  const oembedUrl = new URL('https://www.youtube.com/oembed')
  oembedUrl.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`)
  oembedUrl.searchParams.set('format', 'json')

  try {
    const oembedResponse = await fetch(oembedUrl)

    if (!oembedResponse.ok) {
      throw new Error(`YouTube oEmbed failed with ${oembedResponse.status}`)
    }

    const payload = await oembedResponse.json()

    response.json({
      video: {
        id: videoId,
        title: cleanText(payload.title, 160) || 'YouTube video',
        author: cleanText(payload.author_name, 80) || 'YouTube',
        thumbnail: payload.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      },
    })
  } catch {
    response.json({
      video: {
        id: videoId,
        title: 'YouTube video',
        author: 'YouTube',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      },
    })
  }
})

app.get('/api/youtube/video', async (request, response) => {
  const videoId = validateYouTubeId(String(request.query.videoId ?? ''))

  if (!videoId) {
    response.status(400).json({ message: 'A valid YouTube video id is required.' })
    return
  }

  if (!process.env.YOUTUBE_API_KEY) {
    response.status(503).json({
      code: 'YOUTUBE_API_KEY_MISSING',
      message: 'Set YOUTUBE_API_KEY on the server to verify YouTube videos.',
    })
    return
  }

  try {
    const detailsById = await fetchVideoDetails([videoId], true)
    const details = detailsById.get(videoId)

    if (!details) {
      response.status(404).json({ message: 'This YouTube video was not found.' })
      return
    }

    if (details.embeddable === false) {
      response.status(409).json({ message: 'This video is not allowed in embedded players.' })
      return
    }

    response.json({ video: videoFromDetails(videoId, details) })
  } catch (error) {
    console.error('YouTube video lookup error:', error)
    response.status(502).json({ message: 'Unable to verify this YouTube video.' })
  }
})

app.get('/api/youtube/search', async (request, response) => {
  const searchQuery = cleanText(request.query.query, 120)

  if (searchQuery.length < 2) {
    response.status(400).json({ message: 'Search query is too short.' })
    return
  }

  if (!process.env.YOUTUBE_API_KEY) {
    response.status(503).json({
      code: 'YOUTUBE_API_KEY_MISSING',
      message: 'Set YOUTUBE_API_KEY on the server to enable YouTube search.',
    })
    return
  }

  try {
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
    searchUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY)
    searchUrl.searchParams.set('part', 'snippet')
    searchUrl.searchParams.set('type', 'video')
    searchUrl.searchParams.set('maxResults', String(YOUTUBE_SEARCH_FETCH_LIMIT))
    searchUrl.searchParams.set('safeSearch', 'moderate')
    searchUrl.searchParams.set('q', searchQuery)

    const searchResponse = await fetch(searchUrl)
    const searchPayload = await searchResponse.json()

    if (!searchResponse.ok) {
      response.status(searchResponse.status).json({
        message: searchPayload.error?.message || 'YouTube search failed.',
      })
      return
    }

    const searchItems = Array.isArray(searchPayload.items) ? searchPayload.items : []
    const videoIds = searchItems
      .map((item) => validateYouTubeId(item.id?.videoId))
      .filter(Boolean)

    const detailsById = await fetchVideoDetails(videoIds)
    const results = searchItems
      .map((item) => {
        const videoId = validateYouTubeId(item.id?.videoId)

        if (!videoId) {
          return null
        }

        const details = detailsById.get(videoId)

        if (details?.embeddable === false) {
          return null
        }

        const snippet = item.snippet ?? {}
        const thumbnail =
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`

        return {
          id: videoId,
          title: cleanText(snippet.title, 160) || 'Untitled video',
          author: cleanText(snippet.channelTitle, 80) || 'YouTube',
          thumbnail,
          duration: details?.duration ?? '',
          publishedAt: snippet.publishedAt ?? '',
          embeddable: details?.embeddable ?? true,
        }
      })
      .filter(Boolean)
      .slice(0, MAX_SEARCH_RESULTS)

    response.json({ results })
  } catch (error) {
    console.error('YouTube search error:', error)
    response.status(502).json({ message: 'Unable to reach YouTube search.' })
  }
})

io.on('connection', (socket) => {
  socket.on('clock:ping', (payload) => {
    socket.emit('clock:pong', {
      clientSentAt: Number(payload?.clientSentAt ?? Date.now()),
      serverTime: Date.now(),
    })
  })

  socket.on('room:join', (payload, reply) => {
    const roomId = normalizeRoomId(payload?.roomId)
    const clientId = cleanText(payload?.clientId, 80)
    const name = normalizeName(payload?.name)

    if (!roomId || !clientId) {
      reply?.({ ok: false, message: 'Room and client identifiers are required.' })
      return
    }

    leaveCurrentRoom(socket)

    const room = getOrCreateRoom(roomId)
    clearRoomCleanup(room)
    pruneDisconnectedMembers(room)

    const existingMember = room.members.get(clientId)
    const member = existingMember ?? {
      clientId,
      name,
      color: colorForClient(clientId),
      connected: true,
      socketId: socket.id,
      lastSeen: Date.now(),
    }

    member.name = name
    member.connected = true
    member.socketId = socket.id
    member.lastSeen = Date.now()
    room.members.set(clientId, member)

    if (!room.ownerId) {
      room.ownerId = clientId
      room.ownerName = name
    }

    if (room.ownerId === clientId) {
      clearOwnerPromotion(room)
      room.ownerName = name
    }

    socket.data.roomId = roomId
    socket.data.clientId = clientId
    socket.join(roomId)

    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(roomId).emit('room:state', state)
  })

  socket.on('chat:send', (payload) => {
    const room = getSocketRoom(socket)
    const member = getSocketMember(socket, room)

    if (!room || !member) {
      return
    }

    const body = normalizeChatBody(payload?.body)

    if (!body) {
      return
    }

    const message = {
      id: randomUUID(),
      clientId: member.clientId,
      name: member.name,
      color: member.color,
      body,
      createdAt: Date.now(),
    }

    room.messages.push(message)
    room.messages = room.messages.slice(-MAX_MESSAGES)
    io.to(room.id).emit('chat:message', message)
  })

  socket.on('owner:loadVideo', (payload) => {
    const room = getSocketRoom(socket)

    if (!ensureOwner(socket, room)) {
      return
    }

    const video = normalizeVideo(payload?.video)

    if (!video) {
      emitRoomError(socket, 'INVALID_VIDEO', 'A valid YouTube video is required.')
      return
    }

    const receivedAt = Date.now()
    const actionTime = normalizeOwnerEventTime(payload?.serverTime, receivedAt)

    room.video = video
    room.status = payload?.status === 'playing' ? 'playing' : 'paused'
    room.baseTime = clampPlaybackTime(normalizeSeconds(payload?.currentTime, 0), room.video)
    room.updatedAt = actionTime
    broadcastRoom(room)
  })

  socket.on('owner:updateVideoMeta', (payload) => {
    const room = getSocketRoom(socket)

    if (!ensureOwner(socket, room) || !room.video) {
      return
    }

    const video = normalizeVideo(payload?.video)

    if (!video || video.id !== room.video.id) {
      return
    }

    room.video = video
    broadcastRoom(room)
  })

  socket.on('owner:play', (payload) => {
    updateOwnerPlayback(socket, 'playing', payload)
  })

  socket.on('owner:pause', (payload) => {
    updateOwnerPlayback(socket, 'paused', payload)
  })

  socket.on('owner:seek', (payload) => {
    const room = getSocketRoom(socket)

    if (!ensurePlaybackMember(socket, room) || !room.video) {
      return
    }

    const receivedAt = Date.now()
    const actionTime = normalizeOwnerEventTime(payload?.serverTime, receivedAt)

    if (isStaleOwnerEvent(room, actionTime)) {
      return
    }

    room.baseTime = clampPlaybackTime(normalizeSeconds(payload?.currentTime, getRoomPlaybackTime(room, actionTime)), room.video)
    room.updatedAt = actionTime
    broadcastRoom(room)
  })

  socket.on('owner:heartbeat', (payload) => {
    const room = getSocketRoom(socket)

    if (!ensureOwner(socket, room) || !room.video) {
      return
    }

    const status = payload?.status === 'paused' ? 'paused' : 'playing'
    const receivedAt = Date.now()
    const actionTime = normalizeOwnerEventTime(payload?.serverTime, receivedAt)

    if (isStaleOwnerEvent(room, actionTime)) {
      return
    }

    room.status = status
    room.baseTime = clampPlaybackTime(normalizeSeconds(payload?.currentTime, getRoomPlaybackTime(room, actionTime)), room.video)
    room.updatedAt = actionTime
    broadcastRoom(room)
  })

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket)
  })
})

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFilePath)
const distDirectory = path.resolve(currentDirectory, '../dist')

app.use(express.static(distDirectory, { fallthrough: true }))
app.get(/.*/, (request, response, next) => {
  if (request.path.startsWith('/api')) {
    next()
    return
  }

  response.sendFile(path.join(distDirectory, 'index.html'), (error) => {
    if (error) {
      response.status(404).send('Build the client with npm run build before running YouWatch in production.')
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`YouWatch server listening on http://localhost:${PORT}`)
})

async function fetchVideoDetails(videoIds, includeSnippet = false) {
  const detailsById = new Map()

  if (videoIds.length === 0) {
    return detailsById
  }

  const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
  detailsUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY)
  detailsUrl.searchParams.set('part', includeSnippet ? 'snippet,contentDetails,status' : 'contentDetails,status')
  detailsUrl.searchParams.set('id', videoIds.join(','))

  const detailsResponse = await fetch(detailsUrl)

  if (!detailsResponse.ok) {
    return detailsById
  }

  const detailsPayload = await detailsResponse.json()
  const detailItems = Array.isArray(detailsPayload.items) ? detailsPayload.items : []

  for (const item of detailItems) {
    const videoId = validateYouTubeId(item.id)

    if (!videoId) {
      continue
    }

    detailsById.set(videoId, {
      duration: formatIsoDuration(item.contentDetails?.duration),
      embeddable: item.status?.embeddable !== false,
      title: cleanText(item.snippet?.title, 160),
      author: cleanText(item.snippet?.channelTitle, 80),
      thumbnail:
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    })
  }

  return detailsById
}

function videoFromDetails(videoId, details) {
  return {
    id: videoId,
    title: details.title || 'YouTube video',
    author: details.author || 'YouTube',
    thumbnail: details.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: details.duration || '',
    embeddable: details.embeddable !== false,
  }
}

function getOrCreateRoom(roomId) {
  const existingRoom = rooms.get(roomId)

  if (existingRoom) {
    return existingRoom
  }

  const room = {
    id: roomId,
    ownerId: '',
    ownerName: '',
    members: new Map(),
    video: null,
    status: 'paused',
    baseTime: 0,
    updatedAt: Date.now(),
    messages: [],
    cleanupTimer: null,
    ownerPromotionTimer: null,
  }

  rooms.set(roomId, room)
  return room
}

function getSocketRoom(socket) {
  if (!socket.data.roomId) {
    return null
  }

  return rooms.get(socket.data.roomId) ?? null
}

function getSocketMember(socket, room) {
  if (!room || !socket.data.clientId) {
    return null
  }

  return room.members.get(socket.data.clientId) ?? null
}

function leaveCurrentRoom(socket) {
  const room = getSocketRoom(socket)
  const clientId = socket.data.clientId

  if (!room || !clientId) {
    return
  }

  const member = room.members.get(clientId)

  if (member && member.socketId === socket.id) {
    member.connected = false
    member.socketId = ''
    member.lastSeen = Date.now()
  }

  socket.leave(room.id)
  socket.data.roomId = undefined
  socket.data.clientId = undefined

  if (room.ownerId === clientId) {
    scheduleOwnerPromotion(room)
  }

  const roomDeleted = scheduleRoomCleanup(room)

  if (!roomDeleted) {
    broadcastRoom(room)
  }
}

function ensureOwner(socket, room) {
  if (!room || socket.data.clientId !== room.ownerId) {
    emitRoomError(socket, 'OWNER_REQUIRED', 'Only the room owner can change the video.')
    return false
  }

  return true
}

function ensurePlaybackMember(socket, room) {
  if (!room || !getSocketMember(socket, room)?.connected) {
    return false
  }

  return true
}

function updateOwnerPlayback(socket, status, payload) {
  const room = getSocketRoom(socket)

  if (!ensurePlaybackMember(socket, room) || !room.video) {
    return
  }

  const receivedAt = Date.now()
  const actionTime = normalizeOwnerEventTime(payload?.serverTime, receivedAt)

  if (isStaleOwnerEvent(room, actionTime)) {
    return
  }

  room.status = status
  room.baseTime = clampPlaybackTime(normalizeSeconds(payload?.currentTime, getRoomPlaybackTime(room, actionTime)), room.video)
  room.updatedAt = actionTime
  broadcastRoom(room)
}

function broadcastRoom(room) {
  if (!room) {
    return
  }

  io.to(room.id).emit('room:state', serializeRoom(room))
}

function serializeRoom(room) {
  const serverTime = Date.now()
  const owner = room.members.get(room.ownerId)

  return {
    id: room.id,
    ownerId: room.ownerId,
    ownerName: owner?.name || room.ownerName,
    members: connectedMembers(room).map((member) => ({
      clientId: member.clientId,
      name: member.name,
      color: member.color,
      connected: member.connected,
    })),
    video: room.video,
    playback: {
      status: room.status,
      currentTime: getRoomPlaybackTime(room, serverTime),
      serverTime,
    },
    messages: room.messages.slice(-MAX_MESSAGES),
  }
}

function getRoomPlaybackTime(room, now = Date.now()) {
  if (room.status !== 'playing') {
    return clampPlaybackTime(room.baseTime, room.video)
  }

  return clampPlaybackTime(Math.max(0, room.baseTime + (now - room.updatedAt) / 1000), room.video)
}

function normalizeOwnerEventTime(value, fallback = Date.now()) {
  const eventTime = Number(value)

  if (!Number.isFinite(eventTime)) {
    return fallback
  }

  return Math.min(fallback + MAX_OWNER_EVENT_FUTURE_MS, Math.max(fallback - MAX_OWNER_EVENT_AGE_MS, eventTime))
}

function isStaleOwnerEvent(room, actionTime) {
  return Number.isFinite(room.updatedAt) && actionTime + OWNER_EVENT_REORDER_GRACE_MS < room.updatedAt
}

function connectedMembers(room) {
  return Array.from(room.members.values()).filter((member) => member.connected)
}

function scheduleOwnerPromotion(room) {
  clearOwnerPromotion(room)
  room.ownerPromotionTimer = setTimeout(() => {
    const currentOwner = room.members.get(room.ownerId)

    if (currentOwner?.connected) {
      return
    }

    const nextOwner = connectedMembers(room)[0]

    if (nextOwner) {
      room.ownerId = nextOwner.clientId
      room.ownerName = nextOwner.name
      broadcastRoom(room)
    }
  }, OWNER_GRACE_MS)
}

function clearOwnerPromotion(room) {
  if (room.ownerPromotionTimer) {
    clearTimeout(room.ownerPromotionTimer)
    room.ownerPromotionTimer = null
  }
}

function scheduleRoomCleanup(room) {
  clearRoomCleanup(room)

  if (connectedMembers(room).length > 0) {
    return false
  }

  if (EMPTY_ROOM_DELETE_DELAY_MS === 0) {
    deleteRoom(room)
    return true
  }

  room.cleanupTimer = setTimeout(() => {
    deleteRoom(room)
  }, EMPTY_ROOM_DELETE_DELAY_MS)

  return false
}

function deleteRoom(room) {
  clearRoomCleanup(room)
  clearOwnerPromotion(room)
  rooms.delete(room.id)
}

function clearRoomCleanup(room) {
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer)
    room.cleanupTimer = null
  }
}

function pruneDisconnectedMembers(room) {
  const cutoff = Date.now() - ROOM_IDLE_TTL_MS

  for (const [clientId, member] of room.members.entries()) {
    if (!member.connected && member.lastSeen < cutoff && clientId !== room.ownerId) {
      room.members.delete(clientId)
    }
  }
}

function emitRoomError(socket, code, message) {
  socket.emit('room:error', { code, message })
}

function normalizeRoomId(value) {
  const roomId = cleanText(value, 48).toLowerCase()
  return /^[a-z0-9-]{3,48}$/.test(roomId) ? roomId : ''
}

function normalizeName(value) {
  const name = cleanText(value, 24)
  return name || `Viewer ${Math.floor(100 + Math.random() * 900)}`
}

function normalizeChatBody(value) {
  return replaceEmojiShortcodes(cleanText(value, MAX_CHAT_BODY_LENGTH)).slice(0, MAX_CHAT_BODY_LENGTH).trim()
}

function replaceEmojiShortcodes(value) {
  return value.replace(/:([a-z0-9_+-]{1,32}):/gi, (match, shortcode) => EMOJI_SHORTCODES.get(shortcode.toLowerCase()) ?? match)
}

function normalizeVideo(value) {
  const videoId = validateYouTubeId(value?.id)

  if (!videoId) {
    return null
  }

  return {
    id: videoId,
    title: cleanText(value?.title, 160) || 'YouTube video',
    author: cleanText(value?.author, 80) || 'YouTube',
    thumbnail: value?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: cleanText(value?.duration, 16),
    embeddable: value?.embeddable !== false,
  }
}

function clampPlaybackTime(value, video) {
  const seconds = normalizeSeconds(value, 0)
  const durationSeconds = parseFormattedDurationSeconds(video?.duration)

  if (durationSeconds <= 0) {
    return seconds
  }

  if (seconds > durationSeconds + STALE_PLAYBACK_RESET_GRACE_SECONDS) {
    return 0
  }

  return Math.min(seconds, Math.max(0, durationSeconds - PLAYBACK_END_BUFFER_SECONDS))
}

function parseFormattedDurationSeconds(duration) {
  const parts = cleanText(duration, 16).split(':').map((part) => Number(part))

  if (parts.length === 0 || parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return 0
  }

  return parts.reduce((totalSeconds, part) => totalSeconds * 60 + part, 0)
}

function normalizeSeconds(value, fallback = 0) {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : fallback
}

function cleanText(value, maxLength) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function validateYouTubeId(value) {
  const videoId = cleanText(value, 32)
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : ''
}

function colorForClient(clientId) {
  let hash = 0

  for (const character of clientId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return MEMBER_COLORS[hash % MEMBER_COLORS.length]
}

function formatIsoDuration(duration) {
  const match = String(duration ?? '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)

  if (!match) {
    return ''
  }

  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}