import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clampPlaybackTime,
  normalizeChatImage,
  normalizeRoomId,
  normalizeRoomSettings,
  normalizeVideo,
  parseFormattedDurationSeconds,
  serializeChatMessage,
  serializeMessageReactions,
} from './index.js'

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
