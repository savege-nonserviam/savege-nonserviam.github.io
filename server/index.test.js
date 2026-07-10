import assert from 'node:assert/strict'
import test from 'node:test'
import { io as createSocketClient } from 'socket.io-client'

process.env.ROOM_PERSISTENCE = '0'

const {
  clampPlaybackTime,
  closeServer,
  httpServer,
  io,
  normalizeChatImage,
  normalizeRoomId,
  normalizeRoomSettings,
  normalizeVideo,
  parseFormattedDurationSeconds,
  resetServerStateForTests,
  serializeChatMessage,
  serializeMessageReactions,
  startServer,
} = await import('./index.js')

const REALTIME_TIMEOUT_MS = 3_000
const OWNER_SESSION_TOKEN = 'a'.repeat(32)
const VIEWER_SESSION_TOKEN = 'b'.repeat(32)
const CURRENT_VIDEO = createVideo('dQw4w9WgXcQ', 'Current video')
const NEXT_VIDEO = createVideo('M7lc1UVf-VE', 'Next video')
const LAST_VIDEO = createVideo('aqz-KE-bpKQ', 'Last video')

function createVideo(id, title) {
  return {
    id,
    title,
    author: 'YouWatch Test',
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration: '3:33',
  }
}

function emitWithAck(socket, eventName, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(REALTIME_TIMEOUT_MS).emit(eventName, payload, (error, response) => {
      if (error) {
        reject(new Error(`${eventName} acknowledgement timed out`))
        return
      }

      resolve(response)
    })
  })
}

function waitForSocketEvent(socket, eventName, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      socket.off(eventName, handleEvent)
      reject(new Error(`Timed out waiting for ${eventName}`))
    }, REALTIME_TIMEOUT_MS)

    const handleEvent = (payload) => {
      let matches

      try {
        matches = predicate(payload)
      } catch (error) {
        clearTimeout(timeoutId)
        socket.off(eventName, handleEvent)
        reject(error)
        return
      }

      if (!matches) {
        return
      }

      clearTimeout(timeoutId)
      socket.off(eventName, handleEvent)
      resolve(payload)
    }

    socket.on(eventName, handleEvent)
  })
}

function connectSocket(serverUrl) {
  const socket = createSocketClient(serverUrl, {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  })

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup()
      socket.disconnect()
      reject(new Error('Timed out connecting realtime test client'))
    }, REALTIME_TIMEOUT_MS)
    const cleanup = () => {
      clearTimeout(timeoutId)
      socket.off('connect', handleConnect)
      socket.off('connect_error', handleConnectError)
    }
    const handleConnect = () => {
      cleanup()
      resolve(socket)
    }
    const handleConnectError = (error) => {
      cleanup()
      socket.disconnect()
      reject(error)
    }

    socket.on('connect', handleConnect)
    socket.on('connect_error', handleConnectError)
    socket.connect()
  })
}

async function waitForCondition(predicate, description) {
  const deadline = Date.now() + REALTIME_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error(`Timed out waiting for ${description}`)
}

async function runRealtimeCase(serverUrl, callback) {
  resetServerStateForTests()
  const clients = new Set()
  const connect = async () => {
    const socket = await connectSocket(serverUrl)
    clients.add(socket)
    return socket
  }

  try {
    await callback(connect)
  } finally {
    for (const socket of clients) {
      socket.removeAllListeners()
      socket.disconnect()
    }

    io.disconnectSockets(true)

    try {
      await waitForCondition(() => io.of('/').sockets.size === 0, 'realtime clients to disconnect')
    } finally {
      resetServerStateForTests()
    }
  }
}

function joinRoom(socket, options = {}) {
  return emitWithAck(socket, 'room:join', {
    roomId: 'integration-room',
    clientId: 'owner-client',
    sessionToken: OWNER_SESSION_TOKEN,
    name: 'Owner',
    ...options,
  })
}

async function loadVideo(socket, video = CURRENT_VIDEO) {
  const statePromise = waitForSocketEvent(socket, 'room:state', (state) => state.video?.id === video.id)

  socket.emit('owner:loadVideo', {
    video,
    currentTime: 0,
    serverTime: Date.now(),
    status: 'paused',
  })

  return statePromise
}

test('normalizes room identifiers conservatively', () => {
  assert.equal(normalizeRoomId('Room-ABC'), 'room-abc')
  assert.equal(normalizeRoomId('ab'), '')
  assert.equal(normalizeRoomId('room with spaces'), '')
  assert.equal(normalizeRoomId('a'.repeat(49)), '')
})

test('normalizes and rejects YouTube video metadata', () => {
  assert.deepEqual(normalizeVideo({ id: 'dQw4w9WgXcQ', title: '  Title  ', author: '  Author  ', thumbnail: '', duration: '3:33' }), {
    id: 'dQw4w9WgXcQ',
    title: 'Title',
    author: 'Author',
    thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    duration: '3:33',
    embeddable: true,
  })
  assert.equal(
    normalizeVideo({ id: 'dQw4w9WgXcQ', thumbnail: 'https://example.com/tracker.png' }).thumbnail,
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  )
  assert.equal(normalizeVideo({ id: 'not-valid' }), null)
})

test('parses and clamps playback duration safely', () => {
  assert.equal(parseFormattedDurationSeconds('1:02:03'), 3723)
  assert.equal(parseFormattedDurationSeconds('04:05'), 245)
  assert.equal(parseFormattedDurationSeconds('bad'), 0)
  assert.equal(clampPlaybackTime(250, { duration: '4:00' }), 239.25)
  assert.equal(clampPlaybackTime(300, { duration: '4:00' }), 0)
})

test('validates chat image payload limits', () => {
  const tinyJpeg = {
    dataUrl: `data:image/jpeg;base64,${Buffer.from('small').toString('base64')}`,
    width: 16,
    height: 9,
    name: 'screen.png',
  }

  assert.equal(normalizeChatImage(tinyJpeg).mimeType, 'image/jpeg')
  assert.equal(normalizeChatImage({ ...tinyJpeg, width: 4000 }), null)
  assert.equal(normalizeChatImage({ ...tinyJpeg, dataUrl: 'data:text/html;base64,PGgxPk5vPC9oMT4=' }), null)
})

test('serializes chat reactions without duplicates or unsupported emoji', () => {
  assert.deepEqual(serializeMessageReactions({ '👍': ['a', 'a', 'b'], '🚫': ['c'] }), [
    { emoji: '👍', count: 2, clientIds: ['a', 'b'] },
  ])
  assert.deepEqual(
    serializeChatMessage({
      id: 'm1',
      clientId: 'c1',
      name: 'Alice',
      color: '#ff5c66',
      body: 'hello',
      image: null,
      reactions: { '🔥': ['c2'] },
      createdAt: 100,
    }).reactions,
    [{ emoji: '🔥', count: 1, clientIds: ['c2'] }],
  )
})

test('normalizes room settings with secure defaults', () => {
  assert.deepEqual(normalizeRoomSettings(), { controlsLocked: false, queueAutoplay: true })
  assert.deepEqual(normalizeRoomSettings({ controlsLocked: true, queueAutoplay: false }), { controlsLocked: true, queueAutoplay: false })
})

test('realtime room regressions', { timeout: 30_000 }, async (t) => {
  resetServerStateForTests()
  t.after(async () => {
    io.disconnectSockets(true)

    try {
      await closeServer()
    } finally {
      resetServerStateForTests()
    }
  })

  await startServer(0)
  const address = httpServer.address()

  assert.ok(address && typeof address === 'object')
  const serverUrl = `http://127.0.0.1:${address.port}`

  await t.test('requires a matching private session token for owner actions', async () => {
    await runRealtimeCase(serverUrl, async (connect) => {
      const missingTokenSocket = await connect()
      const missingTokenJoin = await joinRoom(missingTokenSocket, { sessionToken: undefined })

      assert.equal(missingTokenJoin.ok, false)
      assert.equal(missingTokenJoin.code, 'SESSION_TOKEN_REQUIRED')

      const owner = await connect()
      const ownerJoin = await joinRoom(owner)

      assert.equal(ownerJoin.ok, true)
      assert.equal(ownerJoin.state.ownerId, 'owner-client')

      const attacker = await connect()
      const attackerJoin = await joinRoom(attacker, {
        clientId: 'attacker-client',
        sessionToken: VIEWER_SESSION_TOKEN,
        name: 'Attacker',
      })

      assert.equal(attackerJoin.ok, true)

      const impersonationJoin = await joinRoom(attacker, {
        clientId: 'owner-client',
        sessionToken: VIEWER_SESSION_TOKEN,
        name: 'Impersonator',
      })

      assert.equal(impersonationJoin.ok, false)
      assert.equal(impersonationJoin.code, 'SESSION_MISMATCH')

      const deniedOwnerAction = await emitWithAck(attacker, 'owner:setRoomSettings', { controlsLocked: true })

      assert.equal(deniedOwnerAction.ok, false)

      const ownerAction = await emitWithAck(owner, 'owner:setRoomSettings', { controlsLocked: true })

      assert.equal(ownerAction.ok, true)
      assert.equal(ownerAction.state.settings.controlsLocked, true)
    })
  })

  await t.test('keeps a same-token multi-tab member connected after one tab disconnects', async () => {
    await runRealtimeCase(serverUrl, async (connect) => {
      const firstTab = await connect()
      const secondTab = await connect()

      assert.equal((await joinRoom(firstTab)).ok, true)
      const secondJoin = await joinRoom(secondTab)

      assert.equal(secondJoin.ok, true)
      assert.equal(secondJoin.state.members.length, 1)

      firstTab.disconnect()
      await waitForCondition(() => io.of('/').sockets.size === 1, 'the first owner tab to disconnect')

      const ownerAction = await emitWithAck(secondTab, 'owner:setRoomSettings', { queueAutoplay: false })

      assert.equal(ownerAction.ok, true)
      assert.equal(ownerAction.state.ownerId, 'owner-client')
      assert.equal(ownerAction.state.members.length, 1)
      assert.equal(ownerAction.state.settings.queueAutoplay, false)
    })
  })

  await t.test('broadcasts lightweight playback state for heartbeats', async () => {
    await runRealtimeCase(serverUrl, async (connect) => {
      const owner = await connect()

      assert.equal((await joinRoom(owner)).ok, true)
      await loadVideo(owner)

      const queueResponse = await emitWithAck(owner, 'queue:add', { video: NEXT_VIDEO })
      const chatResponse = await emitWithAck(owner, 'chat:send', { body: 'Heartbeat payload regression' })

      assert.equal(queueResponse.ok, true)
      assert.equal(queueResponse.state.queue.length, 1)
      assert.equal(chatResponse.ok, true)

      const playbackPromise = waitForSocketEvent(
        owner,
        'playback:state',
        (state) => state.videoId === CURRENT_VIDEO.id && state.playback?.currentTime >= 12,
      )

      owner.emit('owner:heartbeat', {
        currentTime: 12,
        serverTime: Date.now(),
        status: 'playing',
      })

      const playbackState = await playbackPromise

      assert.equal(playbackState.videoId, CURRENT_VIDEO.id)
      assert.equal(playbackState.controllerId, 'owner-client')
      assert.equal(playbackState.playback.status, 'playing')
      assert.ok(playbackState.playback.currentTime >= 12 && playbackState.playback.currentTime < 13)
      assert.equal(Object.hasOwn(playbackState, 'messages'), false)
      assert.equal(Object.hasOwn(playbackState, 'queue'), false)
      assert.equal(Object.hasOwn(playbackState, 'history'), false)
    })
  })

  await t.test('consumes one queue item for concurrent autoplay requests', async () => {
    await runRealtimeCase(serverUrl, async (connect) => {
      const owner = await connect()

      assert.equal((await joinRoom(owner)).ok, true)
      await loadVideo(owner)
      assert.equal((await emitWithAck(owner, 'queue:add', { video: NEXT_VIDEO })).ok, true)
      assert.equal((await emitWithAck(owner, 'queue:add', { video: LAST_VIDEO })).ok, true)

      const responses = await Promise.all([
        emitWithAck(owner, 'queue:playNext', { autoplay: true, expectedVideoId: CURRENT_VIDEO.id }),
        emitWithAck(owner, 'queue:playNext', { autoplay: true, expectedVideoId: CURRENT_VIDEO.id }),
      ])
      const successfulResponses = responses.filter((response) => response.ok)
      const staleResponses = responses.filter((response) => response.code === 'STALE_AUTOPLAY')

      assert.equal(successfulResponses.length, 1)
      assert.equal(staleResponses.length, 1)
      assert.equal(successfulResponses[0].state.video.id, NEXT_VIDEO.id)
      assert.deepEqual(successfulResponses[0].state.queue.map((item) => item.video.id), [LAST_VIDEO.id])
    })
  })

  await t.test('acknowledges successful and rejected chat sends', async () => {
    await runRealtimeCase(serverUrl, async (connect) => {
      const owner = await connect()

      assert.equal((await joinRoom(owner)).ok, true)

      const messagePromise = waitForSocketEvent(owner, 'chat:message', (message) => message.body === 'Hello room')
      const successResponse = await emitWithAck(owner, 'chat:send', { body: 'Hello room' })
      const message = await messagePromise

      assert.equal(successResponse.ok, true)
      assert.equal(successResponse.messageId, message.id)

      const failureResponse = await emitWithAck(owner, 'chat:send', { body: '   ' })

      assert.equal(failureResponse.ok, false)
      assert.equal(failureResponse.code, 'EMPTY_MESSAGE')

      const roomState = await emitWithAck(owner, 'owner:setRoomSettings', { controlsLocked: false })

      assert.equal(roomState.ok, true)
      assert.equal(roomState.state.messages.length, 1)
      assert.equal(roomState.state.messages[0].id, successResponse.messageId)
    })
  })
})
