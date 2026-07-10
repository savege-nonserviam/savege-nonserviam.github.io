import 'dotenv/config'

import express from 'express'
import { createServer } from 'node:http'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { Server } from 'socket.io'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFilePath)
const distDirectory = path.resolve(currentDirectory, '../dist')
const PORT = readIntegerEnvironment('PORT', 3001, 1, 65_535)
const ROOM_IDLE_TTL_MS = 10 * 60 * 1000
const EMPTY_ROOM_DELETE_DELAY_MS = readIntegerEnvironment('EMPTY_ROOM_DELETE_DELAY_MS', 45 * 1000, 0, 10 * 60 * 1000)
const OWNER_GRACE_MS = 12 * 1000
const MAX_MESSAGES = 70
const MAX_SEARCH_RESULTS = 10
const YOUTUBE_SEARCH_FETCH_LIMIT = 20
const MAX_QUEUE_ITEMS = 60
const MAX_HISTORY_ITEMS = 24
const PLAYBACK_END_BUFFER_SECONDS = 0.75
const STALE_PLAYBACK_RESET_GRACE_SECONDS = 30
const MAX_OWNER_EVENT_AGE_MS = 15 * 1000
const MAX_OWNER_EVENT_FUTURE_MS = 1000
const OWNER_EVENT_REORDER_GRACE_MS = 1200
const MAX_CHAT_BODY_LENGTH = 400
const MAX_CHAT_IMAGE_BYTES = 700 * 1024
const MAX_CHAT_IMAGE_DIMENSION = 1600
const MAX_SOCKET_PAYLOAD_BYTES = 1_200_000
const MAX_REACTIONS_PER_MESSAGE = 6
const STORYBOARD_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const STORYBOARD_CACHE_MAX_ENTRIES = 240
const VIDEO_CACHE_TTL_MS = 10 * 60 * 1000
const VIDEO_NEGATIVE_CACHE_TTL_MS = 90 * 1000
const VIDEO_CACHE_MAX_ENTRIES = 600
const SEARCH_CACHE_TTL_MS = 60 * 1000
const SEARCH_CACHE_MAX_ENTRIES = 120
const UPSTREAM_FETCH_TIMEOUT_MS = readIntegerEnvironment('UPSTREAM_FETCH_TIMEOUT_MS', 9 * 1000, 1000, 30 * 1000)
const MAX_ACTIVE_ROOMS = readIntegerEnvironment('MAX_ACTIVE_ROOMS', 1000, 10, 10_000)
const MAX_ROOM_MEMBERS = readIntegerEnvironment('MAX_ROOM_MEMBERS', 64, 2, 500)
const MAX_CHAT_IMAGE_BYTES_PER_ROOM = readIntegerEnvironment('MAX_CHAT_IMAGE_BYTES_PER_ROOM', 5 * 1024 * 1024, MAX_CHAT_IMAGE_BYTES, 50 * 1024 * 1024)
const MAX_IP_RATE_LIMIT_ENTRIES = 10_000
const TRUST_PROXY_HOPS = readIntegerEnvironment('TRUST_PROXY_HOPS', 0, 0, 3)
const ROOM_PERSISTENCE_ENABLED = process.env.ROOM_PERSISTENCE !== '0'
const ROOM_PERSISTENCE_FILE = path.resolve(process.env.ROOM_PERSISTENCE_FILE || path.join(currentDirectory, '../data/rooms.json'))
const ROOM_PERSISTENCE_FLUSH_MS = 350
const ROOM_SNAPSHOT_TTL_MS = readIntegerEnvironment('ROOM_SNAPSHOT_TTL_MS', 30 * 24 * 60 * 60 * 1000, 60 * 1000, 365 * 24 * 60 * 60 * 1000)
const MAX_PERSISTED_ROOMS = readIntegerEnvironment('MAX_PERSISTED_ROOMS', 500, 10, 10_000)
const PLAYBACK_CHECKPOINT_MS = readIntegerEnvironment('PLAYBACK_CHECKPOINT_MS', 15 * 1000, 5 * 1000, 5 * 60 * 1000)
const MEMBER_COLORS = ['#ff5c66', '#f2bf5b', '#5ee0c6', '#69a7ff', '#b99cff', '#ff8abf', '#a5dc6d', '#7dd3fc']
const DEFAULT_CORS_ORIGINS = ['https://savege-nonserviam.github.io']
const DEFAULT_ROOM_SETTINGS = Object.freeze({
  controlsLocked: false,
  queueAutoplay: true,
})
const REACTION_EMOJIS = new Set(['👍', '😂', '❤️', '🔥', '👏', '👀', '😭', '💀', '🎉', '🍿'])
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
  ['heart_eyes', '😍'],
  ['starstruck', '🤩'],
  ['mindblown', '🤯'],
  ['shock', '😮'],
  ['wow', '😮'],
  ['melting', '🫠'],
  ['salute', '🫡'],
  ['facepalm', '🤦'],
  ['shrug', '🤷'],
  ['yikes', '😬'],
  ['scream', '😱'],
  ['sleepy', '😴'],
  ['zzz', '😴'],
  ['plead', '🥺'],
  ['hug', '🫶'],
  ['brokenheart', '💔'],
  ['pin', '📌'],
  ['camera', '📸'],
  ['image', '🖼️'],
  ['movie', '🎬'],
  ['cinema', '🎬'],
  ['tv', '📺'],
  ['rewind', '⏪'],
  ['forward', '⏩'],
  ['pause', '⏸️'],
  ['play', '▶️'],
  ['sync', '🔁'],
  ['trust', '🛡️'],
  ['shield', '🛡️'],
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
  maxHttpBufferSize: MAX_SOCKET_PAYLOAD_BYTES,
})

const rooms = new Map()
const storyboardCache = new Map()
const videoDetailsCache = new Map()
const searchCache = new Map()
const ipRateLimits = new Map()
const persistedRooms = loadPersistedRooms()
let persistenceFlushTimer = null

app.disable('x-powered-by')
app.set('trust proxy', TRUST_PROXY_HOPS)
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})
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
  if (!allowHttpRequest(request, response, 'youtube:oembed', 45, 60_000)) {
    return
  }

  const videoId = validateYouTubeId(String(request.query.videoId ?? ''))

  if (!videoId) {
    response.status(400).json({ message: 'A valid YouTube video id is required.' })
    return
  }

  const oembedUrl = new URL('https://www.youtube.com/oembed')
  oembedUrl.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`)
  oembedUrl.searchParams.set('format', 'json')

  try {
    const oembedResponse = await fetchWithTimeout(oembedUrl)

    if (!oembedResponse.ok) {
      if (oembedResponse.status === 404) {
        response.status(404).json({ message: 'This YouTube video was not found.' })
        return
      }

      throw new UpstreamHttpError('YouTube oEmbed', oembedResponse.status)
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
  } catch (error) {
    console.error('YouTube oEmbed lookup error:', safeErrorMessage(error))
    response.status(upstreamResponseStatus(error)).json({ message: 'Unable to verify this YouTube video.' })
  }
})

app.get('/api/youtube/video', async (request, response) => {
  if (!allowHttpRequest(request, response, 'youtube:video', 45, 60_000)) {
    return
  }

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
    console.error('YouTube video lookup error:', safeErrorMessage(error))
    response.status(upstreamResponseStatus(error)).json({ message: 'Unable to verify this YouTube video.' })
  }
})

app.get('/api/youtube/storyboard', async (request, response) => {
  if (!allowHttpRequest(request, response, 'youtube:storyboard', 60, 60_000)) {
    return
  }

  const videoId = validateYouTubeId(String(request.query.videoId ?? ''))

  if (!videoId) {
    response.status(400).json({ message: 'A valid YouTube video id is required.' })
    return
  }

  try {
    response.json({ storyboard: await fetchVideoStoryboard(videoId) })
  } catch (error) {
    console.error('YouTube storyboard lookup error:', safeErrorMessage(error))
    response.json({ storyboard: { videoId, levels: [] } })
  }
})

app.get('/api/youtube/search', async (request, response) => {
  if (!allowHttpRequest(request, response, 'youtube:search', 24, 60_000)) {
    return
  }

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

  const cacheKey = searchQuery.toLocaleLowerCase('en-US')
  const cachedSearch = getCacheValue(searchCache, cacheKey)

  if (cachedSearch.hit) {
    response.json({ results: cachedSearch.value })
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

    const searchResponse = await fetchWithTimeout(searchUrl)
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

        if (!details || details.embeddable === false) {
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
          duration: details.duration,
          publishedAt: snippet.publishedAt ?? '',
          embeddable: details.embeddable,
        }
      })
      .filter(Boolean)
      .slice(0, MAX_SEARCH_RESULTS)

    setCacheValue(searchCache, cacheKey, results, SEARCH_CACHE_TTL_MS, SEARCH_CACHE_MAX_ENTRIES)
    response.json({ results })
  } catch (error) {
    console.error('YouTube search error:', safeErrorMessage(error))
    response.status(upstreamResponseStatus(error)).json({ message: 'Unable to reach YouTube search.' })
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
    const sessionToken = normalizeSessionToken(payload?.sessionToken)
    const name = normalizeName(payload?.name)

    if (!roomId || !clientId) {
      reply?.({ ok: false, code: 'INVALID_ROOM_IDENTITY', message: 'Room and client identifiers are required.' })
      return
    }

    if (!sessionToken) {
      reply?.({ ok: false, code: 'SESSION_TOKEN_REQUIRED', message: 'A valid private session token is required.' })
      return
    }

    const socketIp = getSocketIp(socket)

    if (!allowIpAction(socketIp, 'socket:room-join', 30, 60_000).allowed) {
      reply?.({ ok: false, code: 'RATE_LIMITED', message: 'Slow down before joining another room.' })
      return
    }

    const existingRoom = rooms.get(roomId)
    const existingMember = existingRoom?.members.get(clientId)

    if (existingMember && existingMember.sessionToken !== sessionToken) {
      reply?.({ ok: false, code: 'SESSION_MISMATCH', message: 'This viewer session does not match the existing room member.' })
      return
    }

    if (!existingRoom) {
      if (rooms.size >= MAX_ACTIVE_ROOMS) {
        reply?.({ ok: false, code: 'ROOM_CAPACITY_REACHED', message: 'The server is at room capacity. Try again shortly.' })
        return
      }

      if (!allowIpAction(socketIp, 'socket:room-create', 12, 5 * 60_000).allowed) {
        reply?.({ ok: false, code: 'RATE_LIMITED', message: 'Slow down before creating another room.' })
        return
      }
    }

    if (existingRoom && !existingMember && connectedMembers(existingRoom).length >= MAX_ROOM_MEMBERS) {
      reply?.({ ok: false, code: 'ROOM_FULL', message: 'This room has reached its viewer limit.' })
      return
    }

    leaveCurrentRoom(socket)

    const room = getOrCreateRoom(roomId)
    clearRoomCleanup(room)
    pruneDisconnectedMembers(room)

    const member = room.members.get(clientId) ?? {
      clientId,
      sessionToken,
      name,
      color: colorForClient(clientId, room),
      connected: true,
      trusted: false,
      socketIds: new Set(),
      lastSeen: Date.now(),
    }

    member.socketIds = member.socketIds instanceof Set ? member.socketIds : new Set()
    member.socketIds.add(socket.id)
    member.name = name
    member.connected = true
    member.lastSeen = Date.now()
    room.members.set(clientId, member)
    touchRoom(room)

    if (!room.ownerId) {
      room.ownerId = clientId
      room.ownerName = name
    }

    if (room.ownerId === clientId) {
      clearOwnerPromotion(room)
      room.ownerName = name
      member.trusted = false
    }

    socket.data.roomId = roomId
    socket.data.clientId = clientId
    socket.data.sessionToken = sessionToken
    socket.join(roomId)

    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(roomId).emit('room:state', state)
  })

  socket.on('chat:send', (payload, reply) => {
    const room = getSocketRoom(socket)
    const member = getSocketMember(socket, room)

    if (!room || !member) {
      reply?.({ ok: false, code: 'ROOM_REQUIRED', message: 'Join the room before sending messages.' })
      return
    }

    if (!allowSocketEvent(socket, 'chat:send', 8, 10_000)) {
      reply?.({ ok: false, code: 'RATE_LIMITED', message: 'Slow down before sending another message.' })
      return
    }

    const body = normalizeChatBody(payload?.body)
    const image = normalizeChatImage(payload?.image)

    if (payload?.image && !image) {
      reply?.({ ok: false, code: 'INVALID_IMAGE', message: 'That image could not be validated.' })
      return
    }

    if (!body && !image) {
      reply?.({ ok: false, code: 'EMPTY_MESSAGE', message: 'Write a message or attach an image.' })
      return
    }

    if (image && getRoomChatImageBytes(room) + image.size > MAX_CHAT_IMAGE_BYTES_PER_ROOM) {
      reply?.({ ok: false, code: 'ROOM_IMAGE_LIMIT', message: 'This room has reached its temporary image limit.' })
      return
    }

    const message = {
      id: randomUUID(),
      clientId: member.clientId,
      name: member.name,
      color: member.color,
      body,
      image,
      reactions: {},
      createdAt: Date.now(),
    }

    room.messages.push(message)
    room.messages = room.messages.slice(-MAX_MESSAGES)
    touchRoom(room)
    io.to(room.id).emit('chat:message', serializeChatMessage(message))
    reply?.({ ok: true, messageId: message.id })
  })

  socket.on('chat:react', (payload, reply) => {
    const room = getSocketRoom(socket)
    const member = getSocketMember(socket, room)

    if (!room || !member?.connected) {
      reply?.({ ok: false, message: 'Join the room before reacting.' })
      return
    }

    if (!allowSocketEvent(socket, 'chat:react', 18, 10_000)) {
      reply?.({ ok: false, message: 'Slow down before reacting again.' })
      return
    }

    const message = room.messages.find((entry) => entry.id === cleanText(payload?.messageId, 80))
    const emoji = normalizeReactionEmoji(payload?.emoji)

    if (!message || !emoji) {
      reply?.({ ok: false, message: 'Choose a valid message and reaction.' })
      return
    }

    toggleMessageReaction(message, emoji, member.clientId)
    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(room.id).emit('room:state', state)
  })

  socket.on('chat:delete', (payload, reply) => {
    const room = getSocketRoom(socket)
    const member = getSocketMember(socket, room)

    if (!room || !member?.connected) {
      reply?.({ ok: false, message: 'Join the room before deleting messages.' })
      return
    }

    const messageId = cleanText(payload?.messageId, 80)
    const message = room.messages.find((entry) => entry.id === messageId)

    if (!message) {
      reply?.({ ok: false, message: 'That message is no longer available.' })
      return
    }

    if (message.clientId !== member.clientId && room.ownerId !== member.clientId) {
      reply?.({ ok: false, message: 'Only your messages or the room owner can delete that.' })
      return
    }

    room.messages = room.messages.filter((entry) => entry.id !== messageId)
    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(room.id).emit('room:state', state)
  })

  socket.on('member:updateName', (payload, reply) => {
    const room = getSocketRoom(socket)
    const member = getSocketMember(socket, room)

    if (!room || !member?.connected) {
      reply?.({ ok: false, message: 'Join the room before changing your name.' })
      return
    }

    const name = normalizeName(payload?.name)

    member.name = name

    if (room.ownerId === member.clientId) {
      room.ownerName = name
    }

    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(room.id).emit('room:state', state)
  })

  socket.on('owner:setTrusted', (payload, reply) => {
    const room = getSocketRoom(socket)

    if (!ensureOwner(socket, room)) {
      reply?.({ ok: false, message: 'Only the room owner can trust viewers.' })
      return
    }

    const targetClientId = cleanText(payload?.clientId, 80)
    const targetMember = room.members.get(targetClientId)

    if (!targetMember?.connected || targetMember.clientId === room.ownerId) {
      reply?.({ ok: false, message: 'Choose a connected viewer.' })
      return
    }

    targetMember.trusted = payload?.trusted === true

    if (!targetMember.trusted && room.controllerId === targetMember.clientId) {
      room.controllerId = room.ownerId
    }

    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(room.id).emit('room:state', state)
  })

  socket.on('owner:transferOwnership', (payload, reply) => {
    const room = getSocketRoom(socket)
    const currentOwner = getSocketMember(socket, room)

    if (!ensureOwner(socket, room) || !currentOwner?.connected) {
      reply?.({ ok: false, message: 'Only the room owner can hand off ownership.' })
      return
    }

    const targetClientId = cleanText(payload?.clientId, 80)
    const targetMember = room.members.get(targetClientId)

    if (!targetMember?.connected || targetMember.clientId === room.ownerId) {
      reply?.({ ok: false, message: 'Choose a connected viewer.' })
      return
    }

    currentOwner.trusted = true
    targetMember.trusted = false
    room.ownerId = targetMember.clientId
    room.ownerName = targetMember.name
    room.controllerId = targetMember.clientId
    persistRoom(room)

    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(room.id).emit('room:state', state)
  })

  socket.on('owner:setRoomSettings', (payload, reply) => {
    const room = getSocketRoom(socket)

    if (!ensureOwner(socket, room)) {
      reply?.({ ok: false, message: 'Only the room owner can change room settings.' })
      return
    }

    room.settings = normalizeRoomSettings({ ...room.settings, ...payload })

    if (room.settings.controlsLocked) {
      const controller = room.members.get(room.controllerId)

      if (controller?.clientId !== room.ownerId) {
        room.controllerId = room.ownerId
      }
    }

    persistRoom(room)
    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(room.id).emit('room:state', state)
  })

  socket.on('owner:resetRoom', (payload, reply) => {
    const room = getSocketRoom(socket)

    if (!ensureOwner(socket, room)) {
      reply?.({ ok: false, message: 'Only the room owner can reset the room.' })
      return
    }

    const scope = ['video', 'queue', 'chat', 'all'].includes(payload?.scope) ? payload.scope : 'all'

    if (scope === 'video' || scope === 'all') {
      room.video = null
      room.status = 'paused'
      room.baseTime = 0
      room.updatedAt = Date.now()
      room.controllerId = room.ownerId
    }

    if (scope === 'queue' || scope === 'all') {
      room.queue = []
      room.history = scope === 'all' ? [] : room.history
    }

    if (scope === 'chat' || scope === 'all') {
      room.messages = []
    }

    if (scope === 'all') {
      room.settings = normalizeRoomSettings(DEFAULT_ROOM_SETTINGS)
    }

    persistRoom(room)
    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(room.id).emit('room:state', state)
  })

  socket.on('queue:add', (payload, reply) => {
    const room = getSocketRoom(socket)
    const member = getSocketMember(socket, room)

    if (!ensureController(socket, room) || !member?.connected) {
      reply?.({ ok: false, message: getControllerRequiredMessage(room) })
      return
    }

    if (!allowSocketEvent(socket, 'queue:add', 12, 15_000)) {
      reply?.({ ok: false, message: 'Slow down before adding more videos.' })
      return
    }

    const video = normalizeVideo(payload?.video)

    if (!video) {
      reply?.({ ok: false, message: 'A valid YouTube video is required.' })
      return
    }

    if (room.queue.length >= MAX_QUEUE_ITEMS) {
      reply?.({ ok: false, message: 'The queue is full.' })
      return
    }

    const item = createQueueItem(video, member)
    const position = payload?.position === 'next' ? 'next' : 'end'

    if (position === 'next') {
      room.queue.unshift(item)
    } else {
      room.queue.push(item)
    }

    persistRoom(room)
    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(room.id).emit('room:state', state)
  })

  socket.on('queue:remove', (payload, reply) => {
    const room = getSocketRoom(socket)

    if (!ensureController(socket, room)) {
      reply?.({ ok: false, message: getControllerRequiredMessage(room) })
      return
    }

    const itemId = cleanText(payload?.itemId, 80)
    const previousLength = room.queue.length
    room.queue = room.queue.filter((item) => item.id !== itemId)

    if (room.queue.length === previousLength) {
      reply?.({ ok: false, message: 'That queued video is no longer available.' })
      return
    }

    persistRoom(room)
    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(room.id).emit('room:state', state)
  })

  socket.on('queue:move', (payload, reply) => {
    const room = getSocketRoom(socket)

    if (!ensureController(socket, room)) {
      reply?.({ ok: false, message: getControllerRequiredMessage(room) })
      return
    }

    const itemId = cleanText(payload?.itemId, 80)
    const currentIndex = room.queue.findIndex((item) => item.id === itemId)
    const targetIndex = clampNumber(Number(payload?.targetIndex), 0, room.queue.length - 1, currentIndex)

    if (currentIndex < 0 || currentIndex === targetIndex) {
      reply?.({ ok: false, message: 'Choose a different queue position.' })
      return
    }

    const [item] = room.queue.splice(currentIndex, 1)
    room.queue.splice(targetIndex, 0, item)
    persistRoom(room)

    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(room.id).emit('room:state', state)
  })

  socket.on('queue:clear', (_payload, reply) => {
    const room = getSocketRoom(socket)

    if (!ensureController(socket, room)) {
      reply?.({ ok: false, message: getControllerRequiredMessage(room) })
      return
    }

    room.queue = []
    persistRoom(room)
    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(room.id).emit('room:state', state)
  })

  socket.on('queue:play', (payload, reply) => {
    const room = getSocketRoom(socket)

    if (!ensureController(socket, room)) {
      reply?.({ ok: false, message: getControllerRequiredMessage(room) })
      return
    }

    const itemId = cleanText(payload?.itemId, 80)

    if (!playQueuedItem(room, itemId, socket)) {
      reply?.({ ok: false, message: 'That queued video is no longer available.' })
      return
    }

    persistRoom(room)
    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(room.id).emit('room:state', state)
  })

  socket.on('queue:playNext', (payload, reply) => {
    const room = getSocketRoom(socket)
    const autoplay = payload?.autoplay === true

    if (!(autoplay ? ensureActiveController(socket, room) : ensureController(socket, room))) {
      reply?.({ ok: false, message: getControllerRequiredMessage(room) })
      return
    }

    if (autoplay) {
      const expectedVideoId = validateYouTubeId(payload?.expectedVideoId)

      if (!room.settings?.queueAutoplay) {
        reply?.({ ok: false, code: 'AUTOPLAY_DISABLED', message: 'Queue autoplay is disabled.' })
        return
      }

      if (!expectedVideoId || room.video?.id !== expectedVideoId) {
        reply?.({ ok: false, code: 'STALE_AUTOPLAY', message: 'The room already advanced to another video.' })
        return
      }
    }

    if (!playNextQueuedItem(room, socket)) {
      reply?.({ ok: false, message: 'The queue is empty.' })
      return
    }

    persistRoom(room)
    const state = serializeRoom(room)
    reply?.({ ok: true, state })
    io.to(room.id).emit('room:state', state)
  })

  socket.on('owner:loadVideo', (payload) => {
    const room = getSocketRoom(socket)
    const member = getSocketMember(socket, room)

    if (!ensureController(socket, room)) {
      return
    }

    const video = normalizeVideo(payload?.video)

    if (!video) {
      emitRoomError(socket, 'INVALID_VIDEO', 'A valid YouTube video is required.')
      return
    }

    const receivedAt = Date.now()
    const actionTime = normalizeOwnerEventTime(payload?.serverTime, receivedAt)

    if (isStaleOwnerEvent(room, actionTime)) {
      return
    }

    room.video = video
    room.status = payload?.status === 'playing' ? 'playing' : 'paused'
    room.baseTime = clampPlaybackTime(normalizeSeconds(payload?.currentTime, 0), room.video)
    room.updatedAt = actionTime
    setRoomController(room, socket)
    addHistoryVideo(room, video, member)
    persistRoom(room)
    broadcastRoom(room)
  })

  socket.on('owner:updateVideoMeta', (payload) => {
    const room = getSocketRoom(socket)

    if (!ensureController(socket, room) || !room.video) {
      return
    }

    const video = normalizeVideo(payload?.video)

    if (!video || video.id !== room.video.id) {
      return
    }

    room.video = video
    persistRoom(room)
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

    if (!ensureController(socket, room) || !room.video) {
      return
    }

    const receivedAt = Date.now()
    const actionTime = normalizeOwnerEventTime(payload?.serverTime, receivedAt)

    if (isStaleOwnerEvent(room, actionTime)) {
      return
    }

    room.baseTime = clampPlaybackTime(normalizeSeconds(payload?.currentTime, getRoomPlaybackTime(room, actionTime)), room.video)
    room.updatedAt = actionTime
    setRoomController(room, socket)
    touchRoom(room, receivedAt)
    checkpointRoomPlayback(room, true)
    broadcastPlayback(room)
  })

  socket.on('owner:heartbeat', (payload) => {
    const room = getSocketRoom(socket)

    if (!ensureActiveController(socket, room) || !room.video) {
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
    touchRoom(room, receivedAt)
    checkpointRoomPlayback(room)
    broadcastPlayback(room)
  })

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket)
  })
})

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

if (isMainModule()) {
  startServer(PORT)
    .then((address) => {
      console.log(`YouWatch server listening on http://localhost:${address.port}`)
    })
    .catch((error) => {
      console.error('YouWatch server startup error:', safeErrorMessage(error))
      process.exitCode = 1
    })

  const shutdown = async () => {
    try {
      await closeServer()
    } catch (error) {
      console.error('YouWatch server shutdown error:', safeErrorMessage(error))
      process.exitCode = 1
    }
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

async function fetchVideoDetails(videoIds, includeSnippet = false) {
  const detailsById = new Map()
  const missingVideoIds = []

  for (const videoId of Array.from(new Set(videoIds.map(validateYouTubeId).filter(Boolean)))) {
    const cacheKey = `${includeSnippet ? 'full' : 'status'}:${videoId}`
    const cached = getCacheValue(videoDetailsCache, cacheKey)

    if (!cached.hit) {
      missingVideoIds.push(videoId)
    } else if (cached.value) {
      detailsById.set(videoId, cached.value)
    }
  }

  if (missingVideoIds.length === 0) {
    return detailsById
  }

  const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
  detailsUrl.searchParams.set('key', process.env.YOUTUBE_API_KEY)
  detailsUrl.searchParams.set('part', includeSnippet ? 'snippet,contentDetails,status' : 'contentDetails,status')
  detailsUrl.searchParams.set('id', missingVideoIds.join(','))

  const detailsResponse = await fetchWithTimeout(detailsUrl)

  if (!detailsResponse.ok) {
    throw new UpstreamHttpError('YouTube video details', detailsResponse.status)
  }

  const detailsPayload = await detailsResponse.json()
  const detailItems = Array.isArray(detailsPayload.items) ? detailsPayload.items : []
  const returnedVideoIds = new Set()

  for (const item of detailItems) {
    const videoId = validateYouTubeId(item.id)

    if (!videoId) {
      continue
    }

    const details = {
      duration: formatIsoDuration(item.contentDetails?.duration),
      embeddable: item.status?.embeddable !== false,
      title: cleanText(item.snippet?.title, 160),
      author: cleanText(item.snippet?.channelTitle, 80),
      thumbnail:
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    }
    const cacheKey = `${includeSnippet ? 'full' : 'status'}:${videoId}`

    returnedVideoIds.add(videoId)
    detailsById.set(videoId, details)
    setCacheValue(videoDetailsCache, cacheKey, details, VIDEO_CACHE_TTL_MS, VIDEO_CACHE_MAX_ENTRIES)
  }

  for (const videoId of missingVideoIds) {
    if (!returnedVideoIds.has(videoId)) {
      const cacheKey = `${includeSnippet ? 'full' : 'status'}:${videoId}`
      setCacheValue(videoDetailsCache, cacheKey, null, VIDEO_NEGATIVE_CACHE_TTL_MS, VIDEO_CACHE_MAX_ENTRIES)
    }
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

async function fetchVideoStoryboard(videoId) {
  const cached = getCacheValue(storyboardCache, videoId)

  if (cached.hit) {
    return cached.value
  }

  const watchUrl = new URL('https://www.youtube.com/watch')
  watchUrl.searchParams.set('v', videoId)
  watchUrl.searchParams.set('bpctr', '9999999999')
  watchUrl.searchParams.set('has_verified', '1')

  const watchResponse = await fetchWithTimeout(watchUrl, {
    headers: {
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36',
    },
  })

  if (!watchResponse.ok) {
    throw new UpstreamHttpError('YouTube watch page', watchResponse.status)
  }

  const html = await watchResponse.text()
  const playerResponse = extractInitialPlayerResponse(html)
  const spec = playerResponse?.storyboards?.playerStoryboardSpecRenderer?.spec
  const levels = parseStoryboardSpec(videoId, spec)
  const storyboard = {
    videoId,
    levels,
  }

  setCacheValue(storyboardCache, videoId, storyboard, levels.length > 0 ? STORYBOARD_CACHE_TTL_MS : VIDEO_NEGATIVE_CACHE_TTL_MS, STORYBOARD_CACHE_MAX_ENTRIES)

  return storyboard
}

function extractInitialPlayerResponse(html) {
  const markerIndex = html.indexOf('ytInitialPlayerResponse')

  if (markerIndex < 0) {
    return null
  }

  const objectStart = html.indexOf('{', markerIndex)
  const objectText = extractJsonObject(html, objectStart)

  if (!objectText) {
    return null
  }

  try {
    return JSON.parse(objectText)
  } catch {
    return null
  }
}

function extractJsonObject(text, startIndex) {
  if (startIndex < 0 || text[startIndex] !== '{') {
    return ''
  }

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }

      continue
    }

    if (character === '"') {
      inString = true
      continue
    }

    if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1

      if (depth === 0) {
        return text.slice(startIndex, index + 1)
      }
    }
  }

  return ''
}

function parseStoryboardSpec(videoId, spec) {
  if (typeof spec !== 'string' || !spec.includes('|')) {
    return []
  }

  const [urlTemplate, ...levelSpecs] = spec.split('|')

  return levelSpecs
    .map((levelSpec, index) => parseStoryboardLevel(videoId, urlTemplate, levelSpec, index))
    .filter(Boolean)
    .sort((leftLevel, rightLevel) => leftLevel.width - rightLevel.width)
}

function parseStoryboardLevel(videoId, rawUrlTemplate, levelSpec, levelIndex) {
  const parts = String(levelSpec ?? '').split('#')
  const width = Number(parts[0])
  const height = Number(parts[1])
  const count = Number(parts[2])
  const columns = Number(parts[3])
  const rows = Number(parts[4])
  const intervalMs = Number(parts[5])
  const nameTemplate = parts[6] || 'default'
  const signature = parts[7] || ''

  if (![width, height, count, columns, rows, intervalMs].every(Number.isFinite) || width <= 0 || height <= 0 || count <= 0 || columns <= 0 || rows <= 0 || intervalMs <= 0) {
    return null
  }

  if (!rawUrlTemplate.includes('/sb/') || !rawUrlTemplate.includes(videoId)) {
    return null
  }

  const sheetNameTemplate = nameTemplate.replace(/\$M/g, '{storyboard}')
  const levelUrl = rawUrlTemplate.replace(/\$L/g, String(levelIndex)).replace(/\$N/g, sheetNameTemplate)

  return {
    level: levelIndex,
    width,
    height,
    count,
    columns,
    rows,
    intervalMs,
    urlTemplate: addStoryboardSignature(levelUrl, signature),
  }
}

function addStoryboardSignature(url, signature) {
  if (!signature) {
    return url
  }

  if (url.includes('$M')) {
    return url.replace(/\$M/g, signature)
  }

  return `${url}${url.includes('?') ? '&' : '?'}sigh=${encodeURIComponent(signature)}`
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
    controllerId: '',
    settings: normalizeRoomSettings(),
    queue: [],
    history: [],
    messages: [],
    cleanupTimer: null,
    ownerPromotionTimer: null,
    lastActiveAt: Date.now(),
    lastPlaybackCheckpointAt: 0,
  }

  restorePersistedRoom(room)
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

  const member = room.members.get(socket.data.clientId)

  if (
    !member?.connected ||
    member.sessionToken !== socket.data.sessionToken ||
    !(member.socketIds instanceof Set) ||
    !member.socketIds.has(socket.id)
  ) {
    return null
  }

  return member
}

function leaveCurrentRoom(socket) {
  const room = getSocketRoom(socket)
  const clientId = socket.data.clientId

  if (!room || !clientId) {
    return
  }

  const member = room.members.get(clientId)
  const wasBound = Boolean(member?.socketIds instanceof Set && member.socketIds.delete(socket.id))
  const memberDisconnected = wasBound && member.socketIds.size === 0

  if (memberDisconnected) {
    member.connected = false
    member.lastSeen = Date.now()
    touchRoom(room, member.lastSeen)
  }

  socket.leave(room.id)
  socket.data.roomId = undefined
  socket.data.clientId = undefined
  socket.data.sessionToken = undefined

  if (!wasBound || !memberDisconnected) {
    return
  }

  if (room.ownerId === clientId) {
    scheduleOwnerPromotion(room)
  }

  if (room.controllerId === clientId) {
    room.controllerId = room.ownerId === clientId ? '' : room.ownerId
  }

  const roomDeleted = scheduleRoomCleanup(room)

  if (!roomDeleted) {
    broadcastRoom(room)
  }
}

function ensureOwner(socket, room) {
  const member = getSocketMember(socket, room)

  if (!room || !member || member.clientId !== room.ownerId) {
    emitRoomError(socket, 'OWNER_REQUIRED', 'Only the room owner can manage trusted viewers.')
    return false
  }

  return true
}

function ensureController(socket, room) {
  const member = getSocketMember(socket, room)

  if (!room || !member?.connected || !canMemberControl(room, member)) {
    emitRoomError(socket, 'CONTROLLER_REQUIRED', getControllerRequiredMessage(room))
    return false
  }

  return true
}

function ensureActiveController(socket, room) {
  if (!ensureController(socket, room)) {
    return false
  }

  const clientId = socket.data.clientId
  const activeController = getRoomController(room)

  if (!activeController) {
    room.controllerId = clientId
    return true
  }

  if (activeController.clientId === clientId) {
    room.controllerId = clientId
    return true
  }

  return false
}

function setRoomController(room, socket) {
  if (socket.data.clientId) {
    room.controllerId = socket.data.clientId
  }
}

function updateOwnerPlayback(socket, status, payload) {
  const room = getSocketRoom(socket)

  if (!ensureController(socket, room) || !room.video) {
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
  setRoomController(room, socket)
  touchRoom(room, receivedAt)
  checkpointRoomPlayback(room, status === 'paused')
  broadcastPlayback(room)
}

function broadcastRoom(room) {
  if (!room) {
    return
  }

  io.to(room.id).emit('room:state', serializeRoom(room))
}

function broadcastPlayback(room) {
  if (!room) {
    return
  }

  io.to(room.id).emit('playback:state', serializePlaybackState(room))
}

function serializePlaybackState(room) {
  const serverTime = Date.now()
  const owner = room.members.get(room.ownerId)
  const controller = getRoomController(room)

  return {
    videoId: room.video?.id ?? null,
    controllerId: controller?.clientId ?? room.ownerId,
    controllerName: controller?.name || owner?.name || room.ownerName,
    playback: {
      status: room.status,
      currentTime: getRoomPlaybackTime(room, serverTime),
      serverTime,
    },
  }
}

function serializeRoom(room) {
  const serverTime = Date.now()
  const owner = room.members.get(room.ownerId)
  const controller = getRoomController(room)

  return {
    id: room.id,
    ownerId: room.ownerId,
    ownerName: owner?.name || room.ownerName,
    controllerId: controller?.clientId ?? room.ownerId,
    controllerName: controller?.name || owner?.name || room.ownerName,
    members: connectedMembers(room).map((member) => ({
      clientId: member.clientId,
      name: member.name,
      color: member.color,
      connected: member.connected,
      trusted: Boolean(member.trusted),
    })),
    video: room.video,
    settings: normalizeRoomSettings(room.settings),
    queue: room.queue.map(serializeQueueItem),
    history: room.history.map(serializeHistoryItem),
    playback: {
      status: room.status,
      currentTime: getRoomPlaybackTime(room, serverTime),
      serverTime,
    },
    messages: room.messages.slice(-MAX_MESSAGES).map(serializeChatMessage),
  }
}

function getRoomPlaybackTime(room, now = Date.now()) {
  if (room.status !== 'playing') {
    return clampPlaybackTime(room.baseTime, room.video)
  }

  return clampPlaybackTime(Math.max(0, room.baseTime + (now - room.updatedAt) / 1000), room.video)
}

function getRoomController(room) {
  const controller = room.members.get(room.controllerId)

  if (controller?.connected && canMemberControl(room, controller)) {
    return controller
  }

  const owner = room.members.get(room.ownerId)

  if (owner?.connected) {
    return owner
  }

  if (room.settings?.controlsLocked) {
    return null
  }

  return connectedMembers(room).find((member) => member.trusted) ?? null
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
    room.ownerPromotionTimer = null
    const currentOwner = room.members.get(room.ownerId)

    if (currentOwner?.connected) {
      return
    }

    const nextOwner = connectedMembers(room)[0]

    if (nextOwner) {
      room.ownerId = nextOwner.clientId
      room.ownerName = nextOwner.name
      nextOwner.trusted = false
      room.controllerId = nextOwner.clientId
      persistRoom(room)
      broadcastRoom(room)
    }
  }, OWNER_GRACE_MS)
  room.ownerPromotionTimer.unref?.()
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
    room.cleanupTimer = null
    deleteRoom(room)
  }, EMPTY_ROOM_DELETE_DELAY_MS)
  room.cleanupTimer.unref?.()

  return false
}

function deleteRoom(room) {
  persistRoom(room)
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
      if (room.controllerId === clientId) {
        room.controllerId = room.ownerId
      }

      room.members.delete(clientId)
    }
  }
}

function emitRoomError(socket, code, message) {
  socket.emit('room:error', { code, message })
}

function canMemberControl(room, member) {
  if (!room || !member?.connected) {
    return false
  }

  if (member.clientId === room.ownerId) {
    return true
  }

  return !room.settings?.controlsLocked && Boolean(member.trusted)
}

function getControllerRequiredMessage(room) {
  if (room?.settings?.controlsLocked) {
    return 'The room owner locked playback and queue controls.'
  }

  return 'Only the room owner or trusted viewers can control playback.'
}

function normalizeRoomSettings(value = {}) {
  return {
    controlsLocked: value?.controlsLocked === true,
    queueAutoplay: value?.queueAutoplay !== false,
  }
}

function createQueueItem(video, member) {
  return {
    id: randomUUID(),
    video,
    addedByClientId: cleanText(member?.clientId, 80),
    addedByName: cleanText(member?.name, 24) || 'Viewer',
    addedAt: Date.now(),
  }
}

function serializeQueueItem(item) {
  return {
    id: cleanText(item?.id, 80),
    video: normalizeVideo(item?.video),
    addedByClientId: cleanText(item?.addedByClientId, 80),
    addedByName: cleanText(item?.addedByName, 24) || 'Viewer',
    addedAt: normalizeTimestamp(item?.addedAt),
  }
}

function serializeHistoryItem(item) {
  return {
    id: cleanText(item?.id, 80),
    video: normalizeVideo(item?.video),
    playedByClientId: cleanText(item?.playedByClientId, 80),
    playedByName: cleanText(item?.playedByName, 24) || 'Viewer',
    playedAt: normalizeTimestamp(item?.playedAt),
  }
}

function serializeChatMessage(message) {
  return {
    id: cleanText(message?.id, 80),
    clientId: cleanText(message?.clientId, 80),
    name: cleanText(message?.name, 24) || 'Viewer',
    color: normalizeMemberColor(message?.color),
    body: cleanText(message?.body, MAX_CHAT_BODY_LENGTH),
    image: normalizeChatImage(message?.image),
    reactions: serializeMessageReactions(message?.reactions),
    createdAt: normalizeTimestamp(message?.createdAt),
  }
}

function serializeMessageReactions(reactions) {
  if (!reactions || typeof reactions !== 'object') {
    return []
  }

  return Object.entries(reactions)
    .map(([emoji, clientIds]) => ({
      emoji: normalizeReactionEmoji(emoji),
      count: Array.isArray(clientIds) ? new Set(clientIds.map((clientId) => cleanText(clientId, 80)).filter(Boolean)).size : 0,
      clientIds: Array.isArray(clientIds) ? Array.from(new Set(clientIds.map((clientId) => cleanText(clientId, 80)).filter(Boolean))) : [],
    }))
    .filter((reaction) => reaction.emoji && reaction.count > 0)
    .slice(0, MAX_REACTIONS_PER_MESSAGE)
}

function toggleMessageReaction(message, emoji, clientId) {
  message.reactions = message.reactions && typeof message.reactions === 'object' ? message.reactions : {}
  const currentReactors = new Set(Array.isArray(message.reactions[emoji]) ? message.reactions[emoji] : [])

  if (currentReactors.has(clientId)) {
    currentReactors.delete(clientId)
  } else {
    currentReactors.add(clientId)
  }

  if (currentReactors.size === 0) {
    delete message.reactions[emoji]
    return
  }

  if (!message.reactions[emoji] && Object.keys(message.reactions).length >= MAX_REACTIONS_PER_MESSAGE) {
    return
  }

  message.reactions[emoji] = Array.from(currentReactors)
}

function normalizeReactionEmoji(value) {
  const emoji = String(value ?? '').trim()
  return REACTION_EMOJIS.has(emoji) ? emoji : ''
}

function playQueuedItem(room, itemId, socket) {
  const queueIndex = room.queue.findIndex((item) => item.id === itemId)

  if (queueIndex < 0) {
    return false
  }

  const [item] = room.queue.splice(queueIndex, 1)
  loadQueuedVideo(room, item, socket)
  return true
}

function playNextQueuedItem(room, socket) {
  const item = room.queue.shift()

  if (!item) {
    return false
  }

  loadQueuedVideo(room, item, socket)
  return true
}

function loadQueuedVideo(room, item, socket) {
  const member = getSocketMember(socket, room)

  room.video = item.video
  room.status = 'playing'
  room.baseTime = 0
  room.updatedAt = Date.now()
  setRoomController(room, socket)
  addHistoryVideo(room, item.video, member)
}

function addHistoryVideo(room, video, member) {
  const normalizedVideo = normalizeVideo(video)

  if (!normalizedVideo) {
    return
  }

  const previous = room.history[0]

  if (previous?.video?.id === normalizedVideo.id) {
    previous.playedAt = Date.now()
    previous.playedByClientId = cleanText(member?.clientId, 80)
    previous.playedByName = cleanText(member?.name, 24) || 'Viewer'
    return
  }

  room.history = [
    {
      id: randomUUID(),
      video: normalizedVideo,
      playedByClientId: cleanText(member?.clientId, 80),
      playedByName: cleanText(member?.name, 24) || 'Viewer',
      playedAt: Date.now(),
    },
    ...room.history.filter((item) => item.video?.id !== normalizedVideo.id),
  ].slice(0, MAX_HISTORY_ITEMS)
}

function allowSocketEvent(socket, key, maxEvents, windowMs) {
  const now = Date.now()
  socket.data.rateLimits ??= new Map()
  const limits = socket.data.rateLimits
  const current = limits.get(key)

  if (!current || current.resetAt <= now) {
    limits.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  current.count += 1
  return current.count <= maxEvents
}

function allowHttpRequest(request, response, key, maxEvents, windowMs) {
  const result = allowIpAction(getRequestIp(request), key, maxEvents, windowMs)

  if (result.allowed) {
    return true
  }

  response.setHeader('Retry-After', String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))))
  response.status(429).json({ code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' })
  return false
}

function allowIpAction(ipAddress, key, maxEvents, windowMs) {
  const now = Date.now()
  const rateKey = `${cleanText(ipAddress, 128) || 'unknown'}:${key}`
  const current = ipRateLimits.get(rateKey)

  if (!current || current.resetAt <= now) {
    pruneRateLimits(now)
    ipRateLimits.set(rateKey, { count: 1, resetAt: now + windowMs })
    return { allowed: true, resetAt: now + windowMs }
  }

  current.count += 1
  return { allowed: current.count <= maxEvents, resetAt: current.resetAt }
}

function pruneRateLimits(now = Date.now()) {
  for (const [key, limit] of ipRateLimits.entries()) {
    if (limit.resetAt <= now) {
      ipRateLimits.delete(key)
    }
  }

  while (ipRateLimits.size >= MAX_IP_RATE_LIMIT_ENTRIES) {
    const oldestKey = ipRateLimits.keys().next().value

    if (oldestKey === undefined) {
      break
    }

    ipRateLimits.delete(oldestKey)
  }
}

function getRequestIp(request) {
  return normalizeIpAddress(request.ip || request.socket?.remoteAddress)
}

function getSocketIp(socket) {
  const forwardedFor = socket.handshake?.headers?.['x-forwarded-for']
  const forwardedAddresses = (Array.isArray(forwardedFor) ? forwardedFor : String(forwardedFor ?? '').split(','))
    .map((address) => address.trim())
    .filter(Boolean)
  const forwardedIndex = Math.max(0, forwardedAddresses.length - TRUST_PROXY_HOPS)
  const trustedForwardedAddress = TRUST_PROXY_HOPS > 0 ? forwardedAddresses[forwardedIndex] : ''
  return normalizeIpAddress(trustedForwardedAddress || socket.handshake?.address)
}

function normalizeIpAddress(value) {
  return cleanText(value, 128).replace(/^::ffff:/i, '') || 'unknown'
}

function getCacheValue(cache, key, now = Date.now()) {
  const entry = cache.get(key)

  if (!entry || entry.expiresAt <= now) {
    cache.delete(key)
    return { hit: false, value: null }
  }

  cache.delete(key)
  cache.set(key, entry)
  return { hit: true, value: entry.value }
}

function setCacheValue(cache, key, value, ttlMs, maxEntries) {
  const now = Date.now()

  for (const [cacheKey, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(cacheKey)
    }
  }

  cache.delete(key)
  cache.set(key, { value, expiresAt: now + ttlMs })

  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value

    if (oldestKey === undefined) {
      break
    }

    cache.delete(oldestKey)
  }
}

async function fetchWithTimeout(resource, options = {}, timeoutMs = UPSTREAM_FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  timeout.unref?.()
  const signal = options.signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([options.signal, controller.signal]) : controller.signal

  try {
    return await fetch(resource, { ...options, signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new UpstreamTimeoutError()
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

class UpstreamHttpError extends Error {
  constructor(service, status) {
    super(`${service} returned HTTP ${Number(status) || 502}`)
    this.name = 'UpstreamHttpError'
    this.status = Number(status) || 502
  }
}

class UpstreamTimeoutError extends Error {
  constructor() {
    super('The upstream request timed out.')
    this.name = 'UpstreamTimeoutError'
  }
}

function upstreamResponseStatus(error) {
  if (error instanceof UpstreamTimeoutError) {
    return 504
  }

  if (error instanceof UpstreamHttpError && error.status === 429) {
    return 503
  }

  return 502
}

function safeErrorMessage(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown upstream failure'
}

function getRoomChatImageBytes(room) {
  return room.messages.reduce((total, message) => total + (Number(message.image?.size) || 0), 0)
}

function normalizeTimestamp(value) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now()
}

function normalizeMemberColor(value) {
  return rgbFromHexColor(value) ? value : MEMBER_COLORS[0]
}

function loadPersistedRooms() {
  const snapshots = new Map()

  if (!ROOM_PERSISTENCE_ENABLED || !existsSync(ROOM_PERSISTENCE_FILE)) {
    return snapshots
  }

  try {
    const payload = JSON.parse(readFileSync(ROOM_PERSISTENCE_FILE, 'utf8'))
    const roomsPayload = payload?.rooms && typeof payload.rooms === 'object' ? payload.rooms : {}
    const fileUpdatedAt = normalizePersistedTimestamp(payload?.updatedAt, Date.now())

    for (const [roomId, snapshot] of Object.entries(roomsPayload)) {
      const normalizedRoomId = normalizeRoomId(roomId)

      if (normalizedRoomId) {
        snapshots.set(normalizedRoomId, normalizePersistedSnapshot(snapshot, fileUpdatedAt))
      }
    }

    prunePersistedSnapshots(snapshots)
  } catch (error) {
    console.error('Room persistence load error:', safeErrorMessage(error))
  }

  return snapshots
}

function normalizePersistedSnapshot(snapshot, fallbackUpdatedAt = Date.now()) {
  const video = normalizeVideo(snapshot?.video)

  return {
    video,
    baseTime: clampPlaybackTime(snapshot?.baseTime, video),
    settings: normalizeRoomSettings(snapshot?.settings),
    queue: Array.isArray(snapshot?.queue) ? snapshot.queue.map(normalizePersistedQueueItem).filter(Boolean).slice(0, MAX_QUEUE_ITEMS) : [],
    history: Array.isArray(snapshot?.history) ? snapshot.history.map(normalizePersistedHistoryItem).filter(Boolean).slice(0, MAX_HISTORY_ITEMS) : [],
    updatedAt: normalizePersistedTimestamp(snapshot?.updatedAt ?? snapshot?.lastActiveAt, fallbackUpdatedAt),
  }
}

function normalizePersistedQueueItem(item) {
  const video = normalizeVideo(item?.video)

  if (!video) {
    return null
  }

  return {
    id: cleanText(item?.id, 80) || randomUUID(),
    video,
    addedByClientId: cleanText(item?.addedByClientId, 80),
    addedByName: cleanText(item?.addedByName, 24) || 'Viewer',
    addedAt: normalizeTimestamp(item?.addedAt),
  }
}

function normalizePersistedHistoryItem(item) {
  const video = normalizeVideo(item?.video)

  if (!video) {
    return null
  }

  return {
    id: cleanText(item?.id, 80) || randomUUID(),
    video,
    playedByClientId: cleanText(item?.playedByClientId, 80),
    playedByName: cleanText(item?.playedByName, 24) || 'Viewer',
    playedAt: normalizeTimestamp(item?.playedAt),
  }
}

function restorePersistedRoom(room) {
  const snapshot = persistedRooms.get(room.id)

  if (!snapshot) {
    return
  }

  room.video = snapshot.video
  room.status = 'paused'
  room.baseTime = snapshot.baseTime
  room.updatedAt = Date.now()
  room.settings = normalizeRoomSettings(snapshot.settings)
  room.queue = snapshot.queue.map((item) => ({ ...item, video: normalizeVideo(item.video) })).filter((item) => item.video)
  room.history = snapshot.history.map((item) => ({ ...item, video: normalizeVideo(item.video) })).filter((item) => item.video)
  room.lastActiveAt = snapshot.updatedAt
}

function persistRoom(room) {
  if (!ROOM_PERSISTENCE_ENABLED || !room?.id) {
    return
  }

  touchRoom(room)
  const snapshot = {
    video: normalizeVideo(room.video),
    baseTime: clampPlaybackTime(getRoomPlaybackTime(room), room.video),
    settings: normalizeRoomSettings(room.settings),
    queue: room.queue.map(serializeQueueItem).filter((item) => item.video),
    history: room.history.map(serializeHistoryItem).filter((item) => item.video),
    updatedAt: room.lastActiveAt,
  }

  if (hasPersistableRoomState(snapshot)) {
    persistedRooms.set(room.id, snapshot)
  } else {
    persistedRooms.delete(room.id)
  }

  prunePersistedSnapshots(persistedRooms)
  schedulePersistedRoomsWrite()
}

function checkpointRoomPlayback(room, force = false) {
  const now = Date.now()

  if (!force && now - room.lastPlaybackCheckpointAt < PLAYBACK_CHECKPOINT_MS) {
    return
  }

  room.lastPlaybackCheckpointAt = now
  persistRoom(room)
}

function touchRoom(room, timestamp = Date.now()) {
  if (room) {
    room.lastActiveAt = Math.max(Number(room.lastActiveAt) || 0, timestamp)
  }
}

function hasPersistableRoomState(snapshot) {
  return Boolean(
    snapshot.video ||
      snapshot.queue.length > 0 ||
      snapshot.history.length > 0 ||
      snapshot.settings.controlsLocked !== DEFAULT_ROOM_SETTINGS.controlsLocked ||
      snapshot.settings.queueAutoplay !== DEFAULT_ROOM_SETTINGS.queueAutoplay,
  )
}

function prunePersistedSnapshots(snapshots, now = Date.now()) {
  const sortedSnapshots = Array.from(snapshots.entries()).sort((left, right) => right[1].updatedAt - left[1].updatedAt)
  snapshots.clear()

  for (const [roomId, snapshot] of sortedSnapshots) {
    if (now - snapshot.updatedAt <= ROOM_SNAPSHOT_TTL_MS && snapshots.size < MAX_PERSISTED_ROOMS && hasPersistableRoomState(snapshot)) {
      snapshots.set(roomId, snapshot)
    }
  }
}

function schedulePersistedRoomsWrite() {
  if (persistenceFlushTimer) {
    return
  }

  persistenceFlushTimer = setTimeout(writePersistedRooms, ROOM_PERSISTENCE_FLUSH_MS)
  persistenceFlushTimer.unref?.()
}

function writePersistedRooms() {
  persistenceFlushTimer = null

  if (!ROOM_PERSISTENCE_ENABLED) {
    return
  }

  prunePersistedSnapshots(persistedRooms)
  const temporaryFile = `${ROOM_PERSISTENCE_FILE}.${process.pid}.${randomUUID()}.tmp`

  try {
    mkdirSync(path.dirname(ROOM_PERSISTENCE_FILE), { recursive: true })
    writeFileSync(
      temporaryFile,
      JSON.stringify(
        {
          version: 1,
          updatedAt: new Date().toISOString(),
          rooms: Object.fromEntries(persistedRooms.entries()),
        },
        null,
        2,
      ),
      { encoding: 'utf8', flush: true },
    )
    renameSync(temporaryFile, ROOM_PERSISTENCE_FILE)
  } catch (error) {
    if (existsSync(temporaryFile)) {
      try {
        unlinkSync(temporaryFile)
      } catch {
        // The next persistence pass uses a unique temporary file.
      }
    }

    console.error('Room persistence write error:', safeErrorMessage(error))
  }
}

function flushPersistedRooms() {
  if (persistenceFlushTimer) {
    clearTimeout(persistenceFlushTimer)
    persistenceFlushTimer = null
  }

  writePersistedRooms()
}

function normalizePersistedTimestamp(value, fallback = Date.now()) {
  const numericTimestamp = Number(value)

  if (Number.isFinite(numericTimestamp) && numericTimestamp > 0) {
    return numericTimestamp
  }

  const parsedTimestamp = Date.parse(String(value ?? ''))
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : fallback
}

function startServer(port = PORT) {
  if (httpServer.listening) {
    return Promise.resolve(httpServer.address())
  }

  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      httpServer.off('listening', handleListening)
      reject(error)
    }
    const handleListening = () => {
      httpServer.off('error', handleError)
      resolve(httpServer.address())
    }

    httpServer.once('error', handleError)
    httpServer.once('listening', handleListening)
    httpServer.listen(port)
  })
}

function closeServer() {
  flushPersistedRooms()

  if (!httpServer.listening) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    io.close(resolve)
  })
}

function resetServerStateForTests() {
  if (ROOM_PERSISTENCE_ENABLED) {
    throw new Error('Set ROOM_PERSISTENCE=0 before importing the server test module.')
  }

  for (const room of rooms.values()) {
    clearRoomCleanup(room)
    clearOwnerPromotion(room)
  }

  if (persistenceFlushTimer) {
    clearTimeout(persistenceFlushTimer)
    persistenceFlushTimer = null
  }

  rooms.clear()
  persistedRooms.clear()
  storyboardCache.clear()
  videoDetailsCache.clear()
  searchCache.clear()
  ipRateLimits.clear()
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === currentFilePath : false
}

function normalizeRoomId(value) {
  const rawRoomId = String(value ?? '').replace(/\s+/g, ' ').trim()

  if (rawRoomId.length > 48) {
    return ''
  }

  const roomId = rawRoomId.toLowerCase()
  return /^[a-z0-9-]{3,48}$/.test(roomId) ? roomId : ''
}

function normalizeSessionToken(value) {
  const sessionToken = String(value ?? '').trim()
  return /^[a-zA-Z0-9_-]{32,128}$/.test(sessionToken) ? sessionToken : ''
}

function normalizeName(value) {
  const name = cleanText(value, 24)
  return name || `Viewer ${Math.floor(100 + Math.random() * 900)}`
}

function normalizeChatBody(value) {
  return replaceEmojiShortcodes(cleanText(value, MAX_CHAT_BODY_LENGTH)).slice(0, MAX_CHAT_BODY_LENGTH).trim()
}

function normalizeChatImage(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const dataUrl = String(value.dataUrl ?? '')
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-z0-9+/=]+)$/i)

  if (!match) {
    return null
  }

  const byteLength = Math.floor((match[2].length * 3) / 4)

  if (byteLength <= 0 || byteLength > MAX_CHAT_IMAGE_BYTES) {
    return null
  }

  const width = Math.round(Number(value.width))
  const height = Math.round(Number(value.height))

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > MAX_CHAT_IMAGE_DIMENSION || height > MAX_CHAT_IMAGE_DIMENSION) {
    return null
  }

  return {
    dataUrl,
    mimeType: match[1].toLowerCase().replace('image/jpg', 'image/jpeg'),
    name: cleanText(value.name, 80),
    width,
    height,
    size: byteLength,
  }
}

function replaceEmojiShortcodes(value) {
  return value
    .replace(/:([a-z0-9_+-]{1,32}):/gi, (match, shortcode) => findClosestEmoji(shortcode) || match)
    .replace(/(^|\s):([a-z0-9_+-]{1,32})(?=\s|$)/gi, (match, prefix, shortcode) => {
      const emoji = findClosestEmoji(shortcode)
      return emoji ? `${prefix}${emoji}` : match
    })
}

function findClosestEmoji(shortcode) {
  const query = String(shortcode ?? '').toLowerCase()
  const exactEmoji = EMOJI_SHORTCODES.get(query)

  if (exactEmoji) {
    return exactEmoji
  }

  let bestEmoji = ''
  let bestScore = 0

  for (const [term, emoji] of EMOJI_SHORTCODES.entries()) {
    const score = scoreEmojiTerm(term, query)

    if (score > bestScore) {
      bestScore = score
      bestEmoji = emoji
    }
  }

  return bestEmoji
}

function scoreEmojiTerm(term, query) {
  if (!query) {
    return 0
  }

  if (term === query) {
    return 100
  }

  if (term.startsWith(query)) {
    return 80 - Math.min(20, term.length - query.length)
  }

  if (term.includes(query)) {
    return 58 - Math.min(18, term.indexOf(query))
  }

  return isSubsequence(query, term) ? 32 - Math.min(12, term.length - query.length) : 0
}

function isSubsequence(query, term) {
  let queryIndex = 0

  for (const character of term) {
    if (character === query[queryIndex]) {
      queryIndex += 1
    }
  }

  return queryIndex === query.length
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
    thumbnail: normalizeYouTubeThumbnail(value?.thumbnail, videoId),
    duration: cleanText(value?.duration, 16),
    embeddable: value?.embeddable !== false,
  }
}

function normalizeYouTubeThumbnail(value, videoId) {
  const fallback = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`

  try {
    const thumbnailUrl = new URL(String(value ?? ''))
    const allowedHost = thumbnailUrl.protocol === 'https:' && ['i.ytimg.com', 'img.youtube.com'].includes(thumbnailUrl.hostname.toLowerCase())
    const pathSegments = thumbnailUrl.pathname.split('/').filter(Boolean)
    const videoSegmentIndex = pathSegments.findIndex((segment) => segment === 'vi' || segment === 'vi_webp') + 1

    if (allowedHost && videoSegmentIndex > 0 && pathSegments[videoSegmentIndex] === videoId) {
      return thumbnailUrl.toString()
    }
  } catch {
    return fallback
  }

  return fallback
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

function clampNumber(value, min, max, fallback = min) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, value))
}

function readIntegerEnvironment(name, fallback, min, max) {
  const rawValue = String(process.env[name] ?? '').trim()
  const value = Number(rawValue)

  if (!rawValue || !Number.isInteger(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, value))
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

function colorForClient(clientId, room = null) {
  const hash = hashClientId(clientId)
  const startIndex = hash % MEMBER_COLORS.length
  const usedColors = room ? connectedMembers(room).map((member) => member.color) : []

  for (let offset = 0; offset < MEMBER_COLORS.length; offset += 1) {
    const color = MEMBER_COLORS[(startIndex + offset) % MEMBER_COLORS.length]

    if (!usedColors.some((usedColor) => colorsAreTooSimilar(color, usedColor))) {
      return color
    }
  }

  return MEMBER_COLORS[startIndex]
}

function hashClientId(clientId) {
  let hash = 0

  for (const character of clientId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return hash
}

function colorsAreTooSimilar(color, otherColor) {
  const currentRgb = rgbFromHexColor(color)
  const otherRgb = rgbFromHexColor(otherColor)

  if (!currentRgb || !otherRgb) {
    return color === otherColor
  }

  const redDelta = currentRgb.red - otherRgb.red
  const greenDelta = currentRgb.green - otherRgb.green
  const blueDelta = currentRgb.blue - otherRgb.blue
  const distance = Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta)

  return distance < 112
}

function rgbFromHexColor(color) {
  const match = String(color ?? '').match(/^#([0-9a-f]{6})$/i)

  if (!match) {
    return null
  }

  const value = Number.parseInt(match[1], 16)

  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  }
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

export {
  app,
  clampPlaybackTime,
  closeServer,
  flushPersistedRooms,
  httpServer,
  io,
  normalizeChatImage,
  normalizeRoomId,
  normalizeRoomSettings,
  normalizeSessionToken,
  normalizeVideo,
  parseFormattedDurationSeconds,
  resetServerStateForTests,
  serializeChatMessage,
  serializeMessageReactions,
  serializePlaybackState,
  startServer,
}
