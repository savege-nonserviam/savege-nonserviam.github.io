import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent as ReactSyntheticEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import {
  Check,
  Copy,
  Crown,
  Image as ImageIcon,
  Link as LinkIcon,
  LoaderCircle,
  Lock,
  Maximize2,
  MessageCircle,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Search as SearchIcon,
  Send,
  ShieldCheck,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import youwatchLogo from './assets/YouWatch.png'
import './App.css'

type PlaybackStatus = 'playing' | 'paused'
type MaterialComplexity = 'simple' | 'busy' | 'dense'
type ScrollState = 'top' | 'scrolled' | 'compressed'
type ScrollDirection = 'idle' | 'up' | 'down'

type VideoMeta = {
  id: string
  title: string
  author: string
  thumbnail: string
  duration?: string
  embeddable?: boolean
}

type RoomMember = {
  clientId: string
  name: string
  color: string
  connected: boolean
  trusted: boolean
}

type ChatImage = {
  dataUrl: string
  mimeType: string
  name: string
  width: number
  height: number
  size: number
}

type ChatMessage = {
  id: string
  clientId: string
  name: string
  color: string
  body: string
  image?: ChatImage | null
  createdAt: number
}

type RoomState = {
  id: string
  ownerId: string
  ownerName: string
  controllerId: string
  controllerName: string
  members: RoomMember[]
  video: VideoMeta | null
  playback: {
    status: PlaybackStatus
    currentTime: number
    serverTime: number
  }
  messages: ChatMessage[]
}

type JoinResponse = {
  ok: boolean
  state?: RoomState
  message?: string
}

type SearchResult = VideoMeta & {
  duration: string
  publishedAt: string
}

type SearchResponse = {
  code?: string
  results?: SearchResult[]
  message?: string
}

type ClockSample = {
  offset: number
  latency: number
  receivedAt: number
}

type EmojiOption = {
  name: string
  emoji: string
  aliases?: string[]
  keywords?: string[]
}

type TimelinePreviewState = {
  active: boolean
  percent: number
  time: number
}

type StoryboardLevel = {
  level: number
  width: number
  height: number
  count: number
  columns: number
  rows: number
  intervalMs: number
  urlTemplate: string
}

type VideoStoryboard = {
  videoId: string
  levels: StoryboardLevel[]
}

type StoryboardFrame = {
  imageUrl: string
  column: number
  columns: number
  row: number
  rows: number
}

type YouTubePlayer = {
  loadVideoById: (options: { videoId: string; startSeconds?: number }) => void
  cueVideoById: (options: { videoId: string; startSeconds?: number }) => void
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getAvailableQualityLevels?: () => string[]
  setPlaybackQuality?: (suggestedQuality: string) => void
  getPlaybackRate?: () => number
  setPlaybackRate?: (suggestedRate: number) => void
  getVolume: () => number
  setVolume: (volume: number) => void
  mute: () => void
  unMute: () => void
  isMuted: () => boolean
  getCurrentTime: () => number
  getDuration: () => number
  getPlayerState: () => number
  getIframe: () => HTMLIFrameElement
  destroy: () => void
}

type YouTubePlayerEvent = {
  data: number
  target: YouTubePlayer
}

type YouTubeNamespace = {
  Player: new (
    elementId: string,
    options: {
      width: string
      height: string
      playerVars: Record<string, string | number>
      events: {
        onReady: (event: YouTubePlayerEvent) => void
        onStateChange: (event: YouTubePlayerEvent) => void
        onError: (event: YouTubePlayerEvent) => void
      }
    },
  ) => YouTubePlayer
  PlayerState: {
    PLAYING: number
    PAUSED: number
    BUFFERING: number
    CUED: number
    ENDED: number
    UNSTARTED: number
  }
}

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const GITHUB_PAGES_HOSTNAME = 'savege-nonserviam.github.io'
const GITHUB_PAGES_SERVER_URL = 'https://savege-nonserviamgithubio-production.up.railway.app'
const SERVER_URL = resolveServerUrl(import.meta.env.VITE_SERVER_URL)
const socket: Socket = SERVER_URL
  ? io(SERVER_URL, { path: '/socket.io', autoConnect: false })
  : io({ path: '/socket.io', autoConnect: false })
const YOUTUBE_PLAYER_ID = 'youtube-player'
const LOCAL_CLIENT_KEY = 'youwatch:client-id'
const LOCAL_NAME_KEY = 'youwatch:name'
const LOCAL_NAME_CONFIRMED_KEY = 'youwatch:name-confirmed'
const LOCAL_VOLUME_KEY = 'youwatch:volume'
const DEFAULT_VOLUME = 72
const SYNC_INTERVAL_MS = 500
const HEARTBEAT_INTERVAL_MS = 1000
const CLOCK_SYNC_INTERVAL_MS = 2500
const CLOCK_SAMPLE_LIMIT = 12
const SYNC_SOFT_DRIFT_SECONDS = 0.22
const SYNC_HARD_DRIFT_SECONDS = 1.15
const SYNC_RATE_NUDGE = 0.05
const OWNER_TRANSIENT_PAUSE_GRACE_MS = 2400
const OWNER_PLAY_COMMAND_GRACE_MS = 1500
const MOBILE_DOUBLE_TAP_MS = 320
const MOBILE_DOUBLE_TAP_DISTANCE_PX = 44
const MOBILE_CHAT_SWIPE_MIN_DISTANCE_PX = 46
const MOBILE_CHAT_SWIPE_MAX_SIDE_DISTANCE_PX = 92
const CHAT_IMAGE_MAX_SOURCE_BYTES = 8 * 1024 * 1024
const CHAT_IMAGE_MAX_BYTES = 700 * 1024
const CHAT_IMAGE_MAX_DIMENSION = 1280
const CHAT_IMAGE_QUALITY_STEPS = [0.84, 0.76, 0.68, 0.58]
const MINI_PLAYER_DEFAULT_OFFSET = 20
const PREFERRED_PLAYBACK_QUALITY = 'hd1080'
const PLAYBACK_QUALITY_FALLBACKS = ['highres', 'hd720', 'large', 'medium', 'small', 'tiny', 'default']
const QUALITY_RETRY_DELAYS_MS = [0, 350, 900, 1800, 3600]
const FULLSCREEN_IDLE_DELAY_MS = 1100
const PLAYBACK_END_BUFFER_SECONDS = 0.75
const STALE_PLAYBACK_RESET_GRACE_SECONDS = 30
const messageTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
})
const EMOJI_OPTIONS: EmojiOption[] = [
  { name: 'smile', emoji: '🙂', aliases: ['happy'], keywords: ['happy', 'nice'] },
  { name: 'grin', emoji: '😀', aliases: ['grinning'], keywords: ['happy'] },
  { name: 'joy', emoji: '😂', aliases: ['laugh', 'lol'], keywords: ['funny', 'laugh'] },
  { name: 'rofl', emoji: '🤣', aliases: ['lmao'], keywords: ['funny', 'laugh'] },
  { name: 'wink', emoji: '😉', keywords: ['joke'] },
  { name: 'blush', emoji: '😊', aliases: ['cute'], keywords: ['happy'] },
  { name: 'heart', emoji: '❤️', aliases: ['love'], keywords: ['like'] },
  { name: 'heart_eyes', emoji: '😍', aliases: ['heart-eyes'], keywords: ['love'] },
  { name: 'starstruck', emoji: '🤩', aliases: ['star_struck'], keywords: ['hype', 'wow'] },
  { name: 'mindblown', emoji: '🤯', aliases: ['mind_blown'], keywords: ['wow'] },
  { name: 'shock', emoji: '😮', aliases: ['wow'], keywords: ['surprise'] },
  { name: 'melting', emoji: '🫠', aliases: ['melt'], keywords: ['awkward'] },
  { name: 'salute', emoji: '🫡', aliases: ['respect'], keywords: ['yes'] },
  { name: 'facepalm', emoji: '🤦', aliases: ['bruh'], keywords: ['oops'] },
  { name: 'shrug', emoji: '🤷', aliases: ['idk'], keywords: ['maybe'] },
  { name: 'yikes', emoji: '😬', aliases: ['grimace'], keywords: ['awkward'] },
  { name: 'scream', emoji: '😱', aliases: ['scared'], keywords: ['shock'] },
  { name: 'sleepy', emoji: '😴', aliases: ['zzz'], keywords: ['tired'] },
  { name: 'plead', emoji: '🥺', aliases: ['please'], keywords: ['cute'] },
  { name: 'hug', emoji: '🫶', aliases: ['hands_heart'], keywords: ['love'] },
  { name: 'brokenheart', emoji: '💔', aliases: ['broken_heart'], keywords: ['sad'] },
  { name: 'fire', emoji: '🔥', aliases: ['lit'], keywords: ['hot'] },
  { name: 'clap', emoji: '👏', aliases: ['applause'], keywords: ['nice'] },
  { name: 'thumbsup', emoji: '👍', aliases: ['thumbs_up', '+1'], keywords: ['yes', 'like'] },
  { name: 'thumbsdown', emoji: '👎', aliases: ['thumbs_down', '-1'], keywords: ['no'] },
  { name: 'ok', emoji: '👌', aliases: ['ok_hand'], keywords: ['yes'] },
  { name: 'pray', emoji: '🙏', aliases: ['please'], keywords: ['thanks'] },
  { name: 'party', emoji: '🥳', aliases: ['partying'], keywords: ['celebrate'] },
  { name: 'eyes', emoji: '👀', keywords: ['watch', 'look'] },
  { name: 'sob', emoji: '😭', aliases: ['cry'], keywords: ['sad'] },
  { name: 'angry', emoji: '😡', aliases: ['mad'], keywords: ['rage'] },
  { name: 'skull', emoji: '💀', aliases: ['dead'], keywords: ['funny'] },
  { name: 'cool', emoji: '😎', aliases: ['sunglasses'], keywords: ['nice'] },
  { name: 'thinking', emoji: '🤔', aliases: ['think'], keywords: ['hmm'] },
  { name: 'wave', emoji: '👋', aliases: ['hello'], keywords: ['hi'] },
  { name: 'rocket', emoji: '🚀', keywords: ['fast', 'launch'] },
  { name: 'star', emoji: '⭐', keywords: ['favorite'] },
  { name: 'check', emoji: '✅', aliases: ['done'], keywords: ['yes'] },
  { name: 'x', emoji: '❌', aliases: ['cross'], keywords: ['no'] },
  { name: 'warning', emoji: '⚠️', aliases: ['warn'], keywords: ['careful'] },
  { name: 'popcorn', emoji: '🍿', keywords: ['watch'] },
  { name: '100', emoji: '💯', aliases: ['hundred'], keywords: ['perfect'] },
  { name: 'sparkles', emoji: '✨', aliases: ['shine'], keywords: ['magic'] },
  { name: 'coffee', emoji: '☕', keywords: ['drink'] },
  { name: 'music', emoji: '🎵', aliases: ['note'], keywords: ['song'] },
  { name: 'crown', emoji: '👑', keywords: ['owner'] },
  { name: 'pin', emoji: '📌', aliases: ['pinned'], keywords: ['save'] },
  { name: 'camera', emoji: '📸', aliases: ['screenshot'], keywords: ['image'] },
  { name: 'image', emoji: '🖼️', aliases: ['picture'], keywords: ['photo'] },
  { name: 'movie', emoji: '🎬', aliases: ['cinema'], keywords: ['video'] },
  { name: 'tv', emoji: '📺', keywords: ['watch'] },
  { name: 'rewind', emoji: '⏪', keywords: ['back'] },
  { name: 'forward', emoji: '⏩', keywords: ['skip'] },
  { name: 'pause', emoji: '⏸️', keywords: ['stop'] },
  { name: 'play', emoji: '▶️', keywords: ['start'] },
  { name: 'sync', emoji: '🔁', keywords: ['resync'] },
  { name: 'trust', emoji: '🛡️', aliases: ['shield'], keywords: ['trusted'] },
]
const EMOJI_SHORTCODE_PATTERN = /:([a-z0-9_+-]{1,32}):/gi
const PARTIAL_EMOJI_TOKEN_PATTERN = /(^|\s):([a-z0-9_+-]{1,32})(?=\s|$)/gi
const ACTIVE_EMOJI_TOKEN_PATTERN = /(?:^|\s):([a-z0-9_+-]{0,24})$/i

let youtubeApiPromise: Promise<void> | null = null

function resolveServerUrl(value: unknown) {
  const configuredUrl = normalizeServerUrl(value)

  if (configuredUrl) {
    return configuredUrl
  }

  if (window.location.hostname === GITHUB_PAGES_HOSTNAME) {
    return GITHUB_PAGES_SERVER_URL
  }

  return ''
}

function normalizeServerUrl(value: unknown) {
  const serverUrl = String(value ?? '')
    .trim()
    .replace(/^VITE_SERVER_URL=/, '')
    .replace(/\/+$/, '')

  if (!serverUrl) {
    return ''
  }

  return /^https?:\/\//i.test(serverUrl) ? serverUrl : `https://${serverUrl}`
}

function apiUrl(pathname: string) {
  return SERVER_URL ? `${SERVER_URL}${pathname}` : pathname
}

function resolveEmojiShortcodes(value: string) {
  return value
    .replace(EMOJI_SHORTCODE_PATTERN, (match, shortcode: string) => findEmojiOption(shortcode)?.emoji ?? match)
    .replace(PARTIAL_EMOJI_TOKEN_PATTERN, (match, prefix: string, shortcode: string) => {
      const option = findEmojiOption(shortcode)
      return option ? `${prefix}${option.emoji}` : match
    })
}

function getEmojiSuggestions(value: string) {
  const match = value.match(ACTIVE_EMOJI_TOKEN_PATTERN)

  if (!match) {
    return []
  }

  const query = match[1].toLowerCase()
  const options = query ? getRankedEmojiOptions(query) : EMOJI_OPTIONS

  return options.slice(0, 5)
}

function getRankedEmojiOptions(query: string) {
  return EMOJI_OPTIONS.map((option) => ({ option, score: scoreEmojiOption(option, query) }))
    .filter((entry) => entry.score > 0)
    .sort((leftEntry, rightEntry) => rightEntry.score - leftEntry.score)
    .map((entry) => entry.option)
}

function findEmojiOption(query: string) {
  return getRankedEmojiOptions(query.toLowerCase())[0] ?? null
}

function scoreEmojiOption(option: EmojiOption, query: string) {
  const terms = [option.name, ...(option.aliases ?? []), ...(option.keywords ?? [])]
  return Math.max(...terms.map((term) => scoreEmojiTerm(term.toLowerCase(), query)))
}

function scoreEmojiTerm(term: string, query: string) {
  if (!query) {
    return 1
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

function isSubsequence(query: string, term: string) {
  let queryIndex = 0

  for (const character of term) {
    if (character === query[queryIndex]) {
      queryIndex += 1
    }
  }

  return queryIndex === query.length
}

function insertEmojiSuggestion(value: string, emoji: string) {
  return value.replace(ACTIVE_EMOJI_TOKEN_PATTERN, (token) => `${token.startsWith(' ') ? ' ' : ''}${emoji} `)
}

function App() {
  const [clientId] = useState(getClientId)
  const [displayName, setDisplayName] = useState(getStoredDisplayName)
  const [nameDraft, setNameDraft] = useState(() => getStoredDisplayName())
  const [nameDialogOpen, setNameDialogOpen] = useState(() => !getStoredDisplayName())
  const [roomId] = useState(resolveInitialRoomId)
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [connected, setConnected] = useState(socket.connected)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchAttempted, setSearchAttempted] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [playerReady, setPlayerReady] = useState(false)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [playerStatus, setPlayerStatus] = useState<PlaybackStatus>('paused')
  const [volume, setVolume] = useState(getStoredVolume)
  const [muted, setMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [displayTime, setDisplayTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDraft, setChatDraft] = useState('')
  const [pendingImage, setPendingImage] = useState<ChatImage | null>(null)
  const [previewImage, setPreviewImage] = useState<{ image: ChatImage; author: string } | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [miniPlayerOpen, setMiniPlayerOpen] = useState(false)
  const [miniPlayerPosition, setMiniPlayerPosition] = useState({ right: MINI_PLAYER_DEFAULT_OFFSET, bottom: MINI_PLAYER_DEFAULT_OFFSET })
  const [analyzedMaterial, setAnalyzedMaterial] = useState<{ source: string; complexity: MaterialComplexity } | null>(null)
  const [materialMotion, setMaterialMotion] = useState(false)
  const [scrollState, setScrollState] = useState<ScrollState>('top')
  const [scrollDirection, setScrollDirection] = useState<ScrollDirection>('idle')
  const [fullscreenIdle, setFullscreenIdle] = useState(false)
  const [timelinePreview, setTimelinePreview] = useState<TimelinePreviewState>({ active: false, percent: 0, time: 0 })
  const [videoStoryboard, setVideoStoryboard] = useState<VideoStoryboard | null>(null)

  const roomStateRef = useRef<RoomState | null>(null)
  const displayNameRef = useRef(displayName)
  const serverOffsetRef = useRef(0)
  const clockSamplesRef = useRef<ClockSample[]>([])
  const clockSyncedRef = useRef(false)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const loadedVideoIdRef = useRef<string | null>(null)
  const qualityRetryTimersRef = useRef<number[]>([])
  const ownerTransientSinceRef = useRef<number | null>(null)
  const lastOwnerCommandRef = useRef<{ status: PlaybackStatus; issuedAt: number } | null>(null)
  const lastAudibleVolumeRef = useRef(DEFAULT_VOLUME)
  const videoTapRef = useRef<{ timerId: number; time: number; x: number; y: number } | null>(null)
  const videoSwipeRef = useRef<{ pointerId: number; x: number; y: number; time: number } | null>(null)
  const videoShellRef = useRef<HTMLDivElement | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const searchShellRef = useRef<HTMLFormElement | null>(null)
  const chatInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  const currentVideo = roomState?.video ?? null
  const canConnect = displayName.length > 0
  const miniPlayerActive = miniPlayerOpen && Boolean(currentVideo)
  const ownerName = roomState?.ownerName ?? ''
  const materialComplexity: MaterialComplexity = currentVideo?.thumbnail
    ? analyzedMaterial?.source === currentVideo.thumbnail
      ? analyzedMaterial.complexity
      : 'busy'
    : 'simple'
  const currentMember = roomState?.members.find((member) => member.clientId === clientId) ?? null
  const isOwner = roomState?.ownerId === clientId
  const canControlRoom = isOwner || Boolean(currentMember?.trusted)
  const memberCount = roomState?.members.length ?? 0
  const trustedCount = roomState?.members.filter((member) => member.trusted).length ?? 0
  const recentMessages = useMemo(() => roomState?.messages.slice(-10) ?? [], [roomState?.messages])
  const emojiSuggestions = useMemo(() => (chatOpen ? getEmojiSuggestions(chatDraft) : []), [chatDraft, chatOpen])
  const shareUrl = useMemo(() => `${window.location.origin}${window.location.pathname}${window.location.search}#${roomId}`, [roomId])
  const effectiveStatus = currentVideo ? roomState?.playback.status ?? playerStatus : 'paused'
  const controlUnavailableMessage = getControlUnavailableMessage(roomState)
  const playbackControlTitle = !currentVideo ? 'Load a video first' : canControlRoom ? (effectiveStatus === 'playing' ? 'Pause' : 'Play') : controlUnavailableMessage
  const roleLabel = isOwner ? 'Owner' : currentMember?.trusted ? 'Trusted' : 'Guest'
  const controllerName = roomState?.controllerName || ownerName
  const timelineMax = Math.max(1, Math.floor(duration || displayTime || parseDurationSeconds(currentVideo?.duration) || 1))
  const timelineProgress = currentVideo ? clampNumber((Math.min(displayTime, timelineMax) / timelineMax) * 100, 0, 100) : 0
  const activeVideoStoryboard = videoStoryboard?.videoId === currentVideo?.id ? videoStoryboard : null
  const timelineStoryboardFrame = useMemo(() => getStoryboardFrame(activeVideoStoryboard, timelinePreview.time), [activeVideoStoryboard, timelinePreview.time])
  const timelineStoryboardStyle = useMemo(
    () =>
      timelineStoryboardFrame
        ? ({
            backgroundImage: `url("${timelineStoryboardFrame.imageUrl}")`,
            backgroundPosition: `${getStoryboardPositionPercent(timelineStoryboardFrame.column, timelineStoryboardFrame.columns)}% ${getStoryboardPositionPercent(timelineStoryboardFrame.row, timelineStoryboardFrame.rows)}%`,
            backgroundSize: `${timelineStoryboardFrame.columns * 100}% ${timelineStoryboardFrame.rows * 100}%`,
          }) as CSSProperties
        : undefined,
    [timelineStoryboardFrame],
  )
  const timelinePreviewThumbnailSources = useMemo(() => getTimelinePreviewThumbnailSources(currentVideo), [currentVideo])
  const timelineStyle = useMemo(
    () =>
      ({
        '--timeline-progress': `${timelineProgress}%`,
        '--timeline-preview': `${timelinePreview.percent}%`,
      }) as CSSProperties,
    [timelinePreview.percent, timelineProgress],
  )
  const showSearchPanel = searchOpen && (searchResults.length > 0 || Boolean(searchError) || searching || searchAttempted)
  const miniPlayerStyle = useMemo(
    () =>
      ({
        '--mini-right': `${miniPlayerPosition.right}px`,
        '--mini-bottom': `${miniPlayerPosition.bottom}px`,
      }) as CSSProperties,
    [miniPlayerPosition],
  )
  const audibleVolume = muted ? 0 : volume
  const contentIsMoving = effectiveStatus === 'playing' || materialMotion
  const materialWeightTarget = materialComplexity === 'dense' ? 1 : materialComplexity === 'busy' ? 0.62 : 0.22
  const scrollDepthTarget = scrollState === 'compressed' ? 1 : scrollState === 'scrolled' ? 0.48 : 0
  const focusDepthTarget = searchOpen || chatOpen || nameDialogOpen || playerError ? 1 : 0
  const chromeState = isFullscreen && fullscreenIdle && !chatOpen ? 'minimal' : searchOpen || chatOpen ? 'active' : scrollState === 'compressed' ? 'compact' : 'expanded'
  const viewMode = isFullscreen ? 'fullscreen' : 'classic'
  const materialDepth = useSpringValue(materialWeightTarget)
  const scrollDepth = useSpringValue(scrollDepthTarget)
  const focusDepth = useSpringValue(focusDepthTarget)
  const motionDepth = useSpringValue(contentIsMoving ? 1 : 0)
  const chromeDepth = useSpringValue(chromeState === 'minimal' ? 0 : chromeState === 'compact' ? 0.55 : 1)
  const materialStyle = useMemo(
    () =>
      ({
        '--adaptive-blur': `${Math.round(30 + materialDepth * 16 + motionDepth * 4 + focusDepth * 4)}px`,
        '--adaptive-saturation': (0.76 + materialDepth * 0.12 + focusDepth * 0.04).toFixed(2),
        '--adaptive-smoke': Math.min(0.28, 0.12 + materialDepth * 0.06 + motionDepth * 0.015 + focusDepth * 0.02).toFixed(3),
        '--adaptive-fill': Math.min(0.032, 0.004 + materialDepth * 0.012 + focusDepth * 0.006).toFixed(3),
        '--material-weight': materialDepth.toFixed(3),
        '--motion-depth': motionDepth.toFixed(3),
        '--scroll-depth': scrollDepth.toFixed(3),
        '--focus-depth': focusDepth.toFixed(3),
        '--chrome-depth': chromeDepth.toFixed(3),
        '--parallax-y': `${(-7 * scrollDepth).toFixed(2)}px`,
        '--now-y': `${(-10 * scrollDepth).toFixed(2)}px`,
        '--now-opacity': Math.max(0.76, 1 - scrollDepth * 0.22).toFixed(3),
      }) as CSSProperties,
    [chromeDepth, focusDepth, materialDepth, motionDepth, scrollDepth],
  )

  const serverNow = useCallback(() => Date.now() + serverOffsetRef.current, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const openChatInput = useCallback(() => {
    setMiniPlayerOpen(false)
    setChatOpen(true)
    setFullscreenIdle(false)
    chatInputRef.current?.focus({ preventScroll: true })
  }, [])

  const closeChatInput = useCallback(() => {
    setChatOpen(false)
    chatInputRef.current?.blur()
  }, [])

  const applyEmojiSuggestion = useCallback((option: EmojiOption) => {
    setChatDraft((currentDraft) => insertEmojiSuggestion(currentDraft, option.emoji))
    window.requestAnimationFrame(() => chatInputRef.current?.focus({ preventScroll: true }))
  }, [])

  const attachChatImage = useCallback(async (file: File) => {
    setUploadingImage(true)

    try {
      const image = await prepareChatImage(file)
      setPendingImage(image)
      setChatOpen(true)
      setMiniPlayerOpen(false)
      window.requestAnimationFrame(() => chatInputRef.current?.focus({ preventScroll: true }))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to attach this image.')
    } finally {
      setUploadingImage(false)
      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
    }
  }, [])

  const handleChatPaste = useCallback(
    (event: ReactClipboardEvent<HTMLInputElement>) => {
      const imageFile = findClipboardImageFile(event.clipboardData)

      if (!imageFile) {
        return
      }

      event.preventDefault()
      void attachChatImage(imageFile)
    },
    [attachChatImage],
  )

  const handleImageFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const imageFile = Array.from(event.currentTarget.files ?? []).find((file) => file.type.startsWith('image/'))

      if (imageFile) {
        void attachChatImage(imageFile)
      }
    },
    [attachChatImage],
  )

  const handleOpenImagePicker = useCallback(() => {
    setMiniPlayerOpen(false)
    setChatOpen(true)
    imageInputRef.current?.click()
  }, [])

  const clearQualityRetryTimers = useCallback(() => {
    qualityRetryTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    qualityRetryTimersRef.current = []
  }, [])

  const requestBestPlaybackQuality = useCallback(
    (player = playerRef.current) => {
      if (!player) {
        return
      }

      clearQualityRetryTimers()

      qualityRetryTimersRef.current = QUALITY_RETRY_DELAYS_MS.map((delay) =>
        window.setTimeout(() => {
          if (playerRef.current !== player) {
            return
          }

          applyPreferredPlaybackQuality(player)
        }, delay),
      )
    },
    [clearQualityRetryTimers],
  )

  const estimatePlaybackTime = useCallback(
    (state: RoomState) => {
      const elapsedSeconds = state.playback.status === 'playing' ? Math.max(0, (serverNow() - state.playback.serverTime) / 1000) : 0
      return Math.max(0, state.playback.currentTime + elapsedSeconds)
    },
    [serverNow],
  )

  const joinRoom = useCallback(() => {
    const name = displayNameRef.current

    if (!name) {
      return
    }

    socket.emit(
      'room:join',
      { roomId, clientId, name },
      (response: JoinResponse) => {
        if (response?.ok && response.state) {
          setRoomState(response.state)
          return
        }

        setNotice(response?.message ?? 'Unable to join the room.')
      },
    )
  }, [clientId, roomId])

  const syncClock = useCallback(() => {
    socket.emit('clock:ping', { clientSentAt: Date.now() })
  }, [])

  const applyRoomStateToPlayer = useCallback(
    (state: RoomState) => {
      const player = playerRef.current

      if (!isUsableYouTubePlayer(player) || !playerReady || !state.video) {
        return
      }

      const targetTime = clampPlaybackTime(estimatePlaybackTime(state), state.video, player)
      const videoChanged = loadedVideoIdRef.current !== state.video.id

      if (!videoChanged && playerError) {
        return
      }

      if (videoChanged) {
        loadedVideoIdRef.current = state.video.id
        setPlayerError(null)

        if (state.playback.status === 'playing') {
          player.loadVideoById({ videoId: state.video.id, startSeconds: targetTime })
        } else {
          player.cueVideoById({ videoId: state.video.id, startSeconds: targetTime })
        }

        requestBestPlaybackQuality(player)
        setDisplayTime(targetTime)
        return
      }

      const currentTime = safeCurrentTime(player)
      const driftSeconds = Math.abs(currentTime - targetTime)
      const controlsThisPlayback = state.controllerId === clientId || (isOwner && !state.controllerId)
      const driftLimit = controlsThisPlayback ? 2.5 : SYNC_HARD_DRIFT_SECONDS

      if (driftSeconds > driftLimit) {
        player.seekTo(targetTime, true)
        setPlaybackRate(player, 1)
      } else if (!controlsThisPlayback && state.playback.status === 'playing' && driftSeconds > SYNC_SOFT_DRIFT_SECONDS) {
        setPlaybackRate(player, currentTime < targetTime ? 1 + SYNC_RATE_NUDGE : 1 - SYNC_RATE_NUDGE)
      } else {
        setPlaybackRate(player, 1)
      }

      const youtubeState = player.getPlayerState()
      const playerState = window.YT?.PlayerState

      if (state.playback.status === 'playing') {
        const alreadyMoving = youtubeState === playerState?.PLAYING || youtubeState === playerState?.BUFFERING

        if (!alreadyMoving) {
          player.playVideo()
        }
      } else if (youtubeState !== playerState?.PAUSED && youtubeState !== playerState?.CUED) {
        player.pauseVideo()
      }
    },
    [clientId, estimatePlaybackTime, isOwner, playerError, playerReady, requestBestPlaybackQuality],
  )

  const playOwnerVideoNow = useCallback(
    (video: VideoMeta, startSeconds = 0) => {
      const player = playerRef.current

      if (video.embeddable === false) {
        setNotice('This video is not allowed in embedded players.')
        return false
      }

      if (!isUsableYouTubePlayer(player) || !playerReady) {
        return false
      }

      loadedVideoIdRef.current = video.id
      setPlayerError(null)
      const startTime = clampPlaybackTime(startSeconds, video, player)

      setDisplayTime(startTime)
      ownerTransientSinceRef.current = null
      lastOwnerCommandRef.current = { status: 'playing', issuedAt: Date.now() }
      player.loadVideoById({ videoId: video.id, startSeconds: startTime })
      requestBestPlaybackQuality(player)
      player.playVideo()
      setPlayerStatus('playing')
      return true
    },
    [playerReady, requestBestPlaybackQuality],
  )

  const loadVideo = useCallback(
    (video: VideoMeta, options: { play?: boolean } = {}) => {
      if (!canControlRoom) {
        setNotice(getControlUnavailableMessage(roomStateRef.current))
        return
      }

      const started = options.play === true ? playOwnerVideoNow(video, 0) : false

      if (!started && options.play === true) {
        setNotice('The player is still loading. Press play when it is ready.')
      }

      socket.emit('owner:loadVideo', {
        video,
        currentTime: 0,
        serverTime: serverNow(),
        status: started ? 'playing' : 'paused',
      })
      setSearchOpen(false)
      setSearchResults([])
      setSearchError(null)
      setSearchAttempted(false)
      setSearchText('')
    },
    [canControlRoom, playOwnerVideoNow, serverNow],
  )

  useEffect(() => {
    roomStateRef.current = roomState
  }, [roomState])

  useEffect(() => {
    displayNameRef.current = displayName
  }, [displayName])

  useEffect(() => {
    if (!canConnect) {
      socket.disconnect()
      return
    }

    const handleConnect = () => {
      setConnected(true)
      joinRoom()
      syncClock()
    }

    const handleDisconnect = () => {
      setConnected(false)
      clockSamplesRef.current = []
      clockSyncedRef.current = false
    }

    const handleRoomState = (state: RoomState) => {
      setRoomState(state)
    }

    const handleChatMessage = (message: ChatMessage) => {
      setRoomState((previousState) => {
        if (!previousState) {
          return previousState
        }

        const withoutDuplicate = previousState.messages.filter((existingMessage) => existingMessage.id !== message.id)
        return {
          ...previousState,
          messages: [...withoutDuplicate, message].slice(-80),
        }
      })
    }

    const handleRoomError = (error: { message?: string }) => {
      setNotice(error.message ?? 'Room action failed.')
    }

    const handleClockPong = (payload: { clientSentAt: number; serverTime: number }) => {
      const clientReceivedAt = Date.now()
      const clientSentAt = Number(payload.clientSentAt)
      const serverTime = Number(payload.serverTime)

      if (!Number.isFinite(clientSentAt) || !Number.isFinite(serverTime)) {
        return
      }

      const roundTripMs = Math.max(0, clientReceivedAt - clientSentAt)
      const estimatedLatency = roundTripMs / 2
      const offset = serverTime + estimatedLatency - clientReceivedAt
      const samples = [...clockSamplesRef.current, { offset, latency: estimatedLatency, receivedAt: clientReceivedAt }].slice(-CLOCK_SAMPLE_LIMIT)
      const bestSamples = samples
        .slice()
        .sort((leftSample, rightSample) => leftSample.latency - rightSample.latency)
        .slice(0, Math.max(1, Math.ceil(samples.length / 2)))
      const filteredOffset = bestSamples.reduce((total, sample) => total + sample.offset, 0) / bestSamples.length
      const filteredLatency = bestSamples.reduce((total, sample) => total + sample.latency, 0) / bestSamples.length

      clockSamplesRef.current = samples
      serverOffsetRef.current = clockSyncedRef.current ? serverOffsetRef.current + (filteredOffset - serverOffsetRef.current) * 0.35 : filteredOffset
      clockSyncedRef.current = true
      setLatencyMs(Math.round(filteredLatency))
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('room:state', handleRoomState)
    socket.on('chat:message', handleChatMessage)
    socket.on('room:error', handleRoomError)
    socket.on('clock:pong', handleClockPong)

    socket.connect()

    if (socket.connected) {
      handleConnect()
    }

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('room:state', handleRoomState)
      socket.off('chat:message', handleChatMessage)
      socket.off('room:error', handleRoomError)
      socket.off('clock:pong', handleClockPong)
      socket.disconnect()
    }
  }, [canConnect, joinRoom, syncClock])

  useEffect(() => {
    if (!connected) {
      return
    }

    syncClock()
    const intervalId = window.setInterval(syncClock, CLOCK_SYNC_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [connected, syncClock])

  useEffect(() => {
    let cancelled = false

    loadYouTubeApi().then(() => {
      if (cancelled || !window.YT) {
        return
      }

      playerRef.current = new window.YT.Player(YOUTUBE_PLAYER_ID, {
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          showinfo: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            configureYouTubeIframe(event.target)
            requestBestPlaybackQuality(event.target)
            setPlayerReady(true)
          },
          onStateChange: (event) => {
            const playerState = window.YT?.PlayerState

            if (event.data === playerState?.PLAYING || event.data === playerState?.BUFFERING) {
              requestBestPlaybackQuality(event.target)
              setPlayerStatus('playing')
            }

            if (event.data === playerState?.PAUSED || event.data === playerState?.CUED || event.data === playerState?.ENDED) {
              setPlayerStatus('paused')
            }

            const state = roomStateRef.current

            if (state?.video && playerState && canControlPlaybackState(state, clientId)) {
              const isPlaying = event.data === playerState.PLAYING
              const isPaused = event.data === playerState.PAUSED || event.data === playerState.CUED || event.data === playerState.ENDED
              const isTransient = event.data === playerState.BUFFERING || event.data === playerState.UNSTARTED

              if (isTransient) {
                ownerTransientSinceRef.current ??= Date.now()
                return
              }

              ownerTransientSinceRef.current = null

              if (isPlaying || isPaused) {
                const lastCommand = lastOwnerCommandRef.current

                if (isPaused && lastCommand?.status === 'playing' && Date.now() - lastCommand.issuedAt < OWNER_PLAY_COMMAND_GRACE_MS) {
                  return
                }

                socket.emit('owner:heartbeat', {
                  currentTime: clampPlaybackTime(safeCurrentTime(event.target), state.video, event.target),
                  serverTime: serverNow(),
                  status: isPlaying ? 'playing' : 'paused',
                })
              }
            }
          },
          onError: (event) => {
            setPlayerError(getYouTubePlayerErrorMessage(event.data))
            setPlayerStatus('paused')

            if (roomStateRef.current && canControlPlaybackState(roomStateRef.current, clientId)) {
              socket.emit('owner:pause', { currentTime: safeCurrentTime(event.target), serverTime: serverNow() })
            }
          },
        },
      })
    })

    return () => {
      cancelled = true
      if (typeof playerRef.current?.destroy === 'function') {
        playerRef.current.destroy()
      }
      playerRef.current = null
      loadedVideoIdRef.current = null
      clearQualityRetryTimers()
    }
  }, [clearQualityRetryTimers, clientId, requestBestPlaybackQuality, serverNow])

  useEffect(() => {
    if (roomState) {
      applyRoomStateToPlayer(roomState)
    }
  }, [applyRoomStateToPlayer, roomState])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const player = playerRef.current
      const state = roomStateRef.current

      if (state) {
        applyRoomStateToPlayer(state)
      }

      if (isUsableYouTubePlayer(player)) {
        const nextDuration = player.getDuration()
        const nextDisplayTime = state?.video ? clampPlaybackTime(safeCurrentTime(player), state.video, player) : 0

        setDisplayTime(nextDisplayTime)
        setDuration(Number.isFinite(nextDuration) ? nextDuration : 0)
      }
    }, SYNC_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [applyRoomStateToPlayer])

  useEffect(() => {
    if (!canControlRoom || !playerReady) {
      return
    }

    const intervalId = window.setInterval(() => {
      const player = playerRef.current
      const state = roomStateRef.current

      if (!isUsableYouTubePlayer(player) || !state?.video) {
        return
      }

      const youtubeState = player.getPlayerState()
      const playerState = window.YT?.PlayerState

      if (!playerState) {
        return
      }

      let status: PlaybackStatus

      if (youtubeState === playerState.PLAYING) {
        ownerTransientSinceRef.current = null
        status = 'playing'
      } else if (youtubeState === playerState.PAUSED || youtubeState === playerState.CUED || youtubeState === playerState.ENDED) {
        const lastCommand = lastOwnerCommandRef.current

        if (lastCommand?.status === 'playing' && Date.now() - lastCommand.issuedAt < OWNER_PLAY_COMMAND_GRACE_MS) {
          return
        }

        ownerTransientSinceRef.current = null
        status = 'paused'
      } else if (youtubeState === playerState.BUFFERING || youtubeState === playerState.UNSTARTED) {
        const lastCommand = lastOwnerCommandRef.current

        if (lastCommand?.status === 'playing' && Date.now() - lastCommand.issuedAt < OWNER_PLAY_COMMAND_GRACE_MS) {
          return
        }

        if (state.playback.status !== 'playing') {
          status = 'paused'
        } else {
          const transientStartedAt = ownerTransientSinceRef.current ?? Date.now()
          ownerTransientSinceRef.current = transientStartedAt

          if (Date.now() - transientStartedAt < OWNER_TRANSIENT_PAUSE_GRACE_MS) {
            return
          }

          status = 'paused'
        }
      } else {
        return
      }

      socket.emit('owner:heartbeat', {
        currentTime: clampPlaybackTime(safeCurrentTime(player), state.video, player),
        serverTime: serverNow(),
        status,
      })
    }, HEARTBEAT_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [canControlRoom, playerReady, serverNow])

  useEffect(() => {
    if (!notice) {
      return
    }

    const timeoutId = window.setTimeout(() => setNotice(null), 3600)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  useEffect(() => {
    let cancelled = false

    if (!currentVideo?.thumbnail) {
      return
    }

    const source = currentVideo.thumbnail
    analyzeImageComplexity(currentVideo.thumbnail)
      .then((complexity) => {
        if (!cancelled) {
          setAnalyzedMaterial({ source, complexity })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAnalyzedMaterial({ source, complexity: 'busy' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentVideo?.thumbnail])

  useEffect(() => {
    let cancelled = false

    if (!currentVideo?.id) {
      return
    }

    const videoId = currentVideo.id

    fetchVideoStoryboard(videoId)
      .then((storyboard) => {
        if (!cancelled && storyboard.videoId === videoId) {
          setVideoStoryboard(storyboard)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVideoStoryboard({ videoId, levels: [] })
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentVideo?.id])

  useEffect(() => {
    let lastScrollY = window.scrollY
    let idleTimer = 0
    let animationFrame = 0

    const updateScrollState = () => {
      animationFrame = 0
      const scrollY = window.scrollY
      const delta = scrollY - lastScrollY

      setScrollState(scrollY < 12 ? 'top' : scrollY < 220 ? 'scrolled' : 'compressed')

      if (Math.abs(delta) > 1) {
        setScrollDirection(delta > 0 ? 'down' : 'up')
        setMaterialMotion(true)
        window.clearTimeout(idleTimer)
        idleTimer = window.setTimeout(() => {
          setMaterialMotion(false)
          setScrollDirection('idle')
        }, 220)
      }

      lastScrollY = scrollY
    }

    const handleScroll = () => {
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(updateScrollState)
      }
    }

    updateScrollState()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.clearTimeout(idleTimer)
      window.cancelAnimationFrame(animationFrame)
    }
  }, [])

  useEffect(() => {
    if (!copied) {
      return
    }

    const timeoutId = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timeoutId)
  }, [copied])

  useEffect(() => {
    if (!searchOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (target instanceof Node && !searchShellRef.current?.contains(target)) {
        setSearchOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [searchOpen])

  useEffect(() => {
    if (!chatOpen) {
      chatInputRef.current?.blur()
    }
  }, [chatOpen])

  useEffect(() => {
    return () => {
      if (videoTapRef.current) {
        window.clearTimeout(videoTapRef.current.timerId)
      }
    }
  }, [])

  useEffect(() => {
    const nextVolume = clampVolume(volume)

    if (nextVolume > 0) {
      lastAudibleVolumeRef.current = nextVolume
    }

    writeLocalStorage(LOCAL_VOLUME_KEY, String(nextVolume))

    const player = playerRef.current

    if (!isUsableYouTubePlayer(player) || !playerReady) {
      return
    }

    player.setVolume(nextVolume)

    if (muted || nextVolume === 0) {
      player.mute()
      return
    }

    player.unMute()
  }, [muted, playerReady, volume])

  useEffect(() => {
    if (!isFullscreen) {
      return
    }

    let idleTimer = 0
    let animationFrame = 0
    const wakeFullscreenChrome = () => {
      setFullscreenIdle(false)
      window.clearTimeout(idleTimer)

      if (!chatOpen) {
        idleTimer = window.setTimeout(() => setFullscreenIdle(true), FULLSCREEN_IDLE_DELAY_MS)
      }
    }

    animationFrame = window.requestAnimationFrame(wakeFullscreenChrome)
    document.addEventListener('pointermove', wakeFullscreenChrome, { passive: true })
    document.addEventListener('keydown', wakeFullscreenChrome)
    document.addEventListener('touchstart', wakeFullscreenChrome, { passive: true })

    return () => {
      document.removeEventListener('pointermove', wakeFullscreenChrome)
      document.removeEventListener('keydown', wakeFullscreenChrome)
      document.removeEventListener('touchstart', wakeFullscreenChrome)
      window.clearTimeout(idleTimer)
      window.cancelAnimationFrame(animationFrame)
    }
  }, [chatOpen, isFullscreen])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === videoShellRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const isTyping = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

      if (event.key === 'Enter' && !isTyping) {
        event.preventDefault()
        setChatOpen((wasOpen) => {
          const nextOpen = !wasOpen

          if (nextOpen) {
            window.requestAnimationFrame(openChatInput)
          } else {
            chatInputRef.current?.blur()
          }

          return nextOpen
        })
      }
    }

    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => document.removeEventListener('keydown', handleDocumentKeyDown)
  }, [openChatInput])

  const handleSearchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedSearch = searchText.trim()

    if (!trimmedSearch) {
      return
    }

    if (!canControlRoom) {
      setNotice(controlUnavailableMessage)
      setSearchOpen(false)
      return
    }

    const videoId = parseYouTubeVideoId(trimmedSearch)

    if (videoId) {
      try {
        const video = await fetchVideoMeta(videoId)
        loadVideo(video, { play: true })
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'This YouTube video cannot be loaded.')
      }

      return
    }

    setSearching(true)
    setSearchOpen(true)
    setSearchError(null)
    setSearchAttempted(true)

    try {
      const response = await fetch(apiUrl(`/api/youtube/search?query=${encodeURIComponent(trimmedSearch)}`))
      const payload = (await response.json()) as SearchResponse

      if (!response.ok) {
        if (payload.code === 'YOUTUBE_API_KEY_MISSING') {
          throw new Error('Search is unavailable here. Paste a YouTube link instead.')
        }

        throw new Error(payload.message ?? 'YouTube search failed.')
      }

      setSearchResults(payload.results ?? [])
    } catch (error) {
      setSearchResults([])
      setSearchError(error instanceof Error ? error.message : 'YouTube search failed.')
    } finally {
      setSearching(false)
    }
  }

  const handleTogglePlayback = () => {
    if (!currentVideo) {
      return
    }

    if (!canControlRoom) {
      if (roomStateRef.current?.playback.status === 'playing') {
        applyRoomStateToPlayer(roomStateRef.current)
      }

      setNotice(getControlUnavailableMessage(roomStateRef.current))
      return
    }

    const player = playerRef.current

    if (!isUsableYouTubePlayer(player) || !playerReady) {
      setNotice('The player is still loading.')
      return
    }

    const rawCurrentTime = loadedVideoIdRef.current === currentVideo.id ? safeCurrentTime(player) : roomState?.playback.currentTime ?? 0
    const currentTime = clampPlaybackTime(rawCurrentTime, currentVideo, player)
    const actionServerTime = serverNow()

    if (effectiveStatus === 'playing') {
      ownerTransientSinceRef.current = null
      lastOwnerCommandRef.current = { status: 'paused', issuedAt: Date.now() }
      setPlayerStatus('paused')
      player.pauseVideo()
      socket.emit('owner:pause', { currentTime, serverTime: actionServerTime })
      return
    }

    ownerTransientSinceRef.current = null
    lastOwnerCommandRef.current = { status: 'playing', issuedAt: Date.now() }
    setPlayerStatus('playing')

    if (loadedVideoIdRef.current !== currentVideo.id || playerError) {
      loadedVideoIdRef.current = currentVideo.id
      player.loadVideoById({ videoId: currentVideo.id, startSeconds: currentTime })
      requestBestPlaybackQuality(player)
      player.playVideo()
    } else {
      requestBestPlaybackQuality(player)
      player.playVideo()
    }

    setPlayerError(null)
    socket.emit('owner:play', { currentTime, serverTime: actionServerTime })
  }

  const handleVideoSurfacePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canUseVideoSwipeGesture(event.pointerType) || (event.target instanceof Element && event.target.closest('button, a, input, .mini-player-topbar'))) {
      videoSwipeRef.current = null
      return
    }

    videoSwipeRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
    }
  }

  const clearVideoGestures = () => {
    videoSwipeRef.current = null
  }

  const consumeVideoSurfaceSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = videoSwipeRef.current
    videoSwipeRef.current = null

    if (!start || start.pointerId !== event.pointerId || !canUseVideoSwipeGesture(event.pointerType)) {
      return false
    }

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    const distanceY = Math.abs(deltaY)
    const distanceX = Math.abs(deltaX)

    if (distanceY < MOBILE_CHAT_SWIPE_MIN_DISTANCE_PX || distanceX > MOBILE_CHAT_SWIPE_MAX_SIDE_DISTANCE_PX || distanceY < distanceX * 1.18) {
      return false
    }

    if (videoTapRef.current) {
      window.clearTimeout(videoTapRef.current.timerId)
      videoTapRef.current = null
    }

    event.preventDefault()

    if (deltaY < 0) {
      openChatInput()
    } else {
      closeChatInput()
    }

    return true
  }

  const handleVideoSurfacePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('button, a, input, .mini-player-topbar')) {
      clearVideoGestures()
      return
    }

    if (consumeVideoSurfaceSwipe(event)) {
      return
    }

    if (!isFullscreen && !miniPlayerOpen) {
      if (!currentVideo) {
        return
      }
    }

    if (event.pointerType === 'mouse') {
      handleTogglePlayback()
      return
    }

    if (chatOpen) {
      event.preventDefault()
      openChatInput()
      return
    }

    if (miniPlayerOpen) {
      event.preventDefault()
      handleTogglePlayback()
      return
    }

    const now = event.timeStamp
    const previousTap = videoTapRef.current
    const distance = previousTap ? Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) : Number.POSITIVE_INFINITY
    const isDoubleTap = previousTap && now - previousTap.time <= MOBILE_DOUBLE_TAP_MS && distance <= MOBILE_DOUBLE_TAP_DISTANCE_PX

    if (isDoubleTap) {
      window.clearTimeout(previousTap.timerId)
      videoTapRef.current = null
      event.preventDefault()
      openChatInput()
      return
    }

    videoTapRef.current = {
      time: now,
      x: event.clientX,
      y: event.clientY,
      timerId: window.setTimeout(() => {
        videoTapRef.current = null
        handleTogglePlayback()
      }, MOBILE_DOUBLE_TAP_MS),
    }
  }

  const handleMobileChatButton = () => {
    if (chatOpen) {
      closeChatInput()
      return
    }

    openChatInput()
  }

  const readTimelinePreviewAt = (clientX: number) => {
    if (!currentVideo) {
      return null
    }

    const rect = timelineRef.current?.getBoundingClientRect()

    if (!rect || rect.width <= 0) {
      return null
    }

    const percent = clampNumber(((clientX - rect.left) / rect.width) * 100, 0, 100)
    const time = clampNumber((percent / 100) * timelineMax, 0, timelineMax)

    return { percent, time }
  }

  const handleTimelinePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const preview = readTimelinePreviewAt(event.clientX)

    if (!preview) {
      return
    }

    setTimelinePreview({ ...preview, active: true })
  }

  const handleTimelinePointerLeave = () => {
    setTimelinePreview((currentPreview) => ({ ...currentPreview, active: false }))
  }

  const handleTimelineFocus = () => {
    if (!currentVideo) {
      return
    }

    const time = Math.min(displayTime, timelineMax)
    setTimelinePreview({
      active: true,
      percent: clampNumber((time / timelineMax) * 100, 0, 100),
      time,
    })
  }

  const handleTimelineBlur = () => {
    setTimelinePreview((currentPreview) => ({ ...currentPreview, active: false }))
  }

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    if (!currentVideo) {
      return
    }

    if (!canControlRoom) {
      setNotice(getControlUnavailableMessage(roomStateRef.current))
      return
    }

    const player = playerRef.current
    const nextTime = clampPlaybackTime(Number(event.currentTarget.value), currentVideo, isUsableYouTubePlayer(player) ? player : null)
    const nextPercent = clampNumber((nextTime / timelineMax) * 100, 0, 100)

    if (isUsableYouTubePlayer(player)) {
      player.seekTo(nextTime, true)
    }
    setDisplayTime(nextTime)
    setTimelinePreview({ active: true, percent: nextPercent, time: nextTime })
    socket.emit('owner:seek', { currentTime: nextTime, serverTime: serverNow() })
  }

  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextVolume = clampVolume(Number(event.currentTarget.value))

    setVolume(nextVolume)
    setMuted(nextVolume === 0)
  }

  const handleToggleMute = () => {
    if (muted || volume === 0) {
      setVolume(volume > 0 ? volume : lastAudibleVolumeRef.current)
      setMuted(false)
      return
    }

    setMuted(true)
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
    } catch {
      setNotice('Copy failed. The room link is in the address bar.')
    }
  }

  const handleNameSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextName = normalizeDisplayName(nameDraft)

    if (!nextName) {
      setNotice('Choose a name first.')
      return
    }

    const previousName = displayName

    writeLocalStorage(LOCAL_NAME_KEY, nextName)
    writeLocalStorage(LOCAL_NAME_CONFIRMED_KEY, '1')
    setDisplayName(nextName)
    setNameDraft(nextName)
    setNameDialogOpen(false)
    window.requestAnimationFrame(() => window.scrollTo(0, 0))

    if (connected && roomStateRef.current && nextName !== previousName) {
      socket.emit('member:updateName', { name: nextName }, (response: JoinResponse) => {
        if (response?.ok && response.state) {
          setRoomState(response.state)
          return
        }

        if (response && !response.ok) {
          setNotice(response.message ?? 'Name saved locally. Rejoin to sync it.')
        }
      })
    }
  }

  const handleEditName = () => {
    setNameDraft(displayName)
    setNameDialogOpen(true)
  }

  const handleToggleTrusted = (member: RoomMember) => {
    if (!isOwner || member.clientId === clientId) {
      return
    }

    socket.emit('owner:setTrusted', { clientId: member.clientId, trusted: !member.trusted }, (response: JoinResponse) => {
      if (response?.ok && response.state) {
        setRoomState(response.state)
        return
      }

      setNotice(response?.message ?? 'Unable to update trust.')
    })
  }

  const handleResync = () => {
    const state = roomStateRef.current

    if (!state) {
      return
    }

    setPlaybackRate(playerRef.current, 1)
    applyRoomStateToPlayer(state)
    setNotice(controllerName ? `Synced to ${controllerName}.` : 'Synced to the room.')
  }

  const handleToggleFullscreen = async () => {
    const shell = videoShellRef.current

    if (!shell) {
      return
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }

      setMiniPlayerOpen(false)
      await shell.requestFullscreen()
    } catch {
      setNotice('Fullscreen is not available in this browser.')
    }
  }

  const handleToggleMiniPlayer = async () => {
    if (!currentVideo) {
      setNotice('Load a video first.')
      return
    }

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen()
      } catch {
        setNotice('Exit fullscreen first.')
        return
      }
    }

    setChatOpen(false)
    setMiniPlayerOpen((wasOpen) => !wasOpen)
  }

  const handleMiniPlayerPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!miniPlayerActive || (event.target instanceof Element && event.target.closest('button'))) {
      return
    }

    event.preventDefault()

    const shell = videoShellRef.current
    const startX = event.clientX
    const startY = event.clientY
    const startRight = miniPlayerPosition.right
    const startBottom = miniPlayerPosition.bottom
    const shellWidth = shell?.offsetWidth ?? 500
    const shellHeight = shell?.offsetHeight ?? 280

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextRight = clampNumber(startRight - (moveEvent.clientX - startX), 8, Math.max(8, window.innerWidth - Math.min(180, shellWidth)))
      const nextBottom = clampNumber(startBottom - (moveEvent.clientY - startY), 8, Math.max(8, window.innerHeight - Math.min(140, shellHeight)))

      setMiniPlayerPosition({ right: nextRight, bottom: nextBottom })
    }

    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp, { once: true })
  }

  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const body = resolveEmojiShortcodes(chatDraft).trim()

    if (!body && !pendingImage) {
      setChatOpen(false)
      chatInputRef.current?.blur()
      return
    }
    socket.emit('chat:send', { body, image: pendingImage })
    setChatDraft('')
    setPendingImage(null)
    setChatOpen(false)
    chatInputRef.current?.blur()
  }

  const handleChatInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setChatOpen(false)
      chatInputRef.current?.blur()
      return
    }

    if (event.key === 'Tab' && emojiSuggestions[0]) {
      event.preventDefault()
      applyEmojiSuggestion(emojiSuggestions[0])
    }
  }

  const handleGlassPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    const lightSize = Math.round(Math.min(260, Math.max(120, Math.max(rect.width, rect.height) * 0.42)))

    target.style.setProperty('--glass-x', `${event.clientX - rect.left}px`)
    target.style.setProperty('--glass-y', `${event.clientY - rect.top}px`)
    target.style.setProperty('--glass-light-size', `${lightSize}px`)
    target.style.setProperty('--glass-light-opacity', '1')
  }

  const handleGlassPointerLeave = (event: ReactPointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty('--glass-light-opacity', '0')
  }

  const stopImageLightboxEvent = (event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleImageLightboxBackdropEvent = (event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleImageLightboxBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (event.target === event.currentTarget) {
      setPreviewImage(null)
    }
  }

  const handleTimelinePreviewImageError = (event: ReactSyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget
    const fallbackSources = (image.dataset.fallbackSrcs ?? '').split('|').filter(Boolean)
    const nextSource = fallbackSources.shift()

    if (!nextSource) {
      image.style.opacity = '0'
      return
    }

    image.dataset.fallbackSrcs = fallbackSources.join('|')
    image.src = nextSource
  }

  return (
    <div
      className="app-shell"
      data-chrome={chromeState}
      data-material={materialComplexity}
      data-mini-player={miniPlayerActive ? 'open' : 'closed'}
      data-motion={contentIsMoving ? 'moving' : 'still'}
      data-scroll={scrollState}
      data-scroll-direction={scrollDirection}
      data-view={viewMode}
      style={materialStyle}
    >
      {currentVideo?.thumbnail && (
        <div className="ambient-backdrop" aria-hidden="true">
          <img src={currentVideo.thumbnail} alt="" />
        </div>
      )}

      <header className="titlebar">
        <div className="brand" aria-label="YouWatch">
          <img className="brand-logo" src={youwatchLogo} alt="YouWatch" />
        </div>

        <form className={`search-shell ${searchOpen ? 'is-search-open' : ''}`} ref={searchShellRef} onPointerEnter={handleGlassPointerMove} onPointerMove={handleGlassPointerMove} onPointerLeave={handleGlassPointerLeave} onSubmit={handleSearchSubmit}>
          <SearchIcon size={18} aria-hidden="true" />
          <input
            value={searchText}
            onChange={(event) => {
              setSearchText(event.currentTarget.value)
              setSearchAttempted(false)
              setSearchError(null)
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder={canControlRoom ? 'Search YouTube or paste a link' : 'Ask the host to trust you for controls'}
            aria-label="Search YouTube or paste a link"
            enterKeyHint="search"
            autoComplete="off"
          />
          <button className="icon-button search-submit" type="submit" title="Search" aria-label="Search" disabled={searching}>
            {searching ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : <SearchIcon size={17} aria-hidden="true" />}
          </button>

          {showSearchPanel && (
            <div className="search-panel">
              {searching && <div className="search-message">Searching YouTube...</div>}
              {searchError && <div className="search-message is-error">{searchError}</div>}
              {!searching && !searchError && searchAttempted && searchResults.length === 0 && <div className="search-message">No videos found.</div>}
              {!searching && !searchError &&
                searchResults.map((result) => (
                  <button
                    className="search-result"
                    key={result.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => loadVideo(result, { play: true })}
                  >
                    <img src={result.thumbnail} alt="" />
                    <span className="search-result-copy">
                      <strong>{result.title}</strong>
                      <span>{result.author}</span>
                    </span>
                    {result.duration && <span className="duration-chip">{result.duration}</span>}
                    {!canControlRoom && <Lock size={14} aria-hidden="true" />}
                  </button>
                ))}
            </div>
          )}
        </form>

        <div className="room-tools">
          <button className="room-pill room-button name-button" type="button" onPointerEnter={handleGlassPointerMove} onPointerMove={handleGlassPointerMove} onPointerLeave={handleGlassPointerLeave} onClick={handleEditName} title="Change username">
            <Users size={15} aria-hidden="true" />
            {displayName || 'Name'}
          </button>
          <span className="room-pill" onPointerEnter={handleGlassPointerMove} onPointerMove={handleGlassPointerMove} onPointerLeave={handleGlassPointerLeave} title={isOwner ? 'Owner' : currentMember?.trusted ? 'Trusted controller' : `Owner: ${roomState?.ownerName ?? 'joining'}`}>
            {isOwner ? <Crown size={15} aria-hidden="true" /> : currentMember?.trusted ? <ShieldCheck size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
            {roleLabel}
          </span>
          {trustedCount > 0 && (
            <span className="room-pill trusted-count-pill" onPointerEnter={handleGlassPointerMove} onPointerMove={handleGlassPointerMove} onPointerLeave={handleGlassPointerLeave} title="Trusted viewers">
              <UserCheck size={15} aria-hidden="true" />
              {trustedCount}
            </span>
          )}
          <span className="room-pill" onPointerEnter={handleGlassPointerMove} onPointerMove={handleGlassPointerMove} onPointerLeave={handleGlassPointerLeave} title="Connected viewers">
            <Users size={15} aria-hidden="true" />
            {memberCount}
          </span>
          <button className="room-pill room-button" type="button" onPointerEnter={handleGlassPointerMove} onPointerMove={handleGlassPointerMove} onPointerLeave={handleGlassPointerLeave} onClick={handleCopyLink} title="Copy room link">
            {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            {copied ? 'Copied' : roomId}
          </button>
        </div>
      </header>

      <main className="watch-layout">
        <section className="stage-section" aria-label="Watch room">
          <div className={`video-shell ${isFullscreen ? 'is-fullscreen' : ''} ${miniPlayerActive ? 'is-mini' : ''} ${chatOpen ? 'is-chat-open' : ''} ${fullscreenIdle ? 'is-idle' : ''}`} ref={videoShellRef} style={miniPlayerActive ? miniPlayerStyle : undefined}>
            <div
              className={`player-surface ${currentVideo ? 'has-video' : ''} ${canControlRoom ? 'can-control' : 'is-viewer'}`}
              onPointerDown={handleVideoSurfacePointerDown}
              onPointerUp={handleVideoSurfacePointerUp}
              onPointerCancel={clearVideoGestures}
            >
              <div id={YOUTUBE_PLAYER_ID} className="youtube-player" />
              {!currentVideo && (
                <div className="empty-player">
                  <span className="empty-mark">
                    <LinkIcon size={24} aria-hidden="true" />
                  </span>
                  <h1>{canControlRoom ? 'Choose the first video' : 'Waiting for the host'}</h1>
                  <p>{canControlRoom ? 'Paste a YouTube link or search from the bar.' : ownerName ? `${ownerName} controls the room video.` : 'The host controls the room video.'}</p>
                  <button className="empty-action" type="button" onClick={handleCopyLink}>
                    {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                    {copied ? 'Copied' : 'Invite'}
                  </button>
                </div>
              )}
              {currentVideo && !playerReady && (
                <div className="player-loading">
                  <LoaderCircle size={24} className="spin" aria-hidden="true" />
                </div>
              )}
              {currentVideo && (effectiveStatus !== 'playing' || playerError) && (
                <div className="player-overlay">
                  <img src={currentVideo.thumbnail} alt="" />
                  <div className="player-overlay-shade" />
                  <div className="player-overlay-content" onClick={(event) => event.stopPropagation()}>
                    <button
                      className="center-play-button"
                      type="button"
                      onPointerEnter={handleGlassPointerMove}
                      onPointerMove={handleGlassPointerMove}
                      onPointerLeave={handleGlassPointerLeave}
                      onClick={handleTogglePlayback}
                      disabled={!playerReady && canControlRoom}
                      title={playerError ?? playbackControlTitle}
                      aria-label={playerError ?? playbackControlTitle}
                    >
                      {canControlRoom ? <Play size={28} fill="currentColor" aria-hidden="true" /> : <Lock size={25} aria-hidden="true" />}
                    </button>
                    <span>{playerError ?? (canControlRoom ? 'Ready' : 'Host controlled')}</span>
                    {playerError && currentVideo && (
                      <a className="youtube-fallback-link" href={`https://www.youtube.com/watch?v=${currentVideo.id}`} target="_blank" rel="noreferrer">
                        Open on YouTube
                      </a>
                    )}
                  </div>
                </div>
              )}
              {miniPlayerActive && currentVideo && (
                <div className="mini-player-topbar" onPointerDown={handleMiniPlayerPointerDown} onPointerUp={(event) => event.stopPropagation()}>
                  <span className={`mini-player-status ${effectiveStatus === 'playing' ? 'is-playing' : 'is-paused'}`} aria-hidden="true" />
                  <span className="mini-player-copy">
                    <span className="mini-player-title">{currentVideo.title}</span>
                    <span className="mini-player-author">{currentVideo.author}</span>
                  </span>
                  <button className="icon-button mini-restore-button" type="button" onClick={handleToggleMiniPlayer} title="Return to player" aria-label="Return to full player">
                    <Maximize2 size={15} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            <div className="control-bar" onPointerEnter={handleGlassPointerMove} onPointerMove={handleGlassPointerMove} onPointerLeave={handleGlassPointerLeave}>
              <button
                className="transport-button"
                type="button"
                onClick={handleTogglePlayback}
                disabled={!currentVideo}
                title={playbackControlTitle}
                aria-label={playbackControlTitle}
              >
                {effectiveStatus === 'playing' ? <Pause className="transport-glyph is-pause" size={18} fill="currentColor" aria-hidden="true" /> : <Play className="transport-glyph is-play" size={18} fill="currentColor" aria-hidden="true" />}
              </button>

              <span className="time-code">{formatTime(displayTime)}</span>
              <div
                className={`timeline-wrap ${timelinePreview.active && currentVideo ? 'is-previewing' : ''}`}
                ref={timelineRef}
                style={timelineStyle}
                onPointerEnter={handleTimelinePointerMove}
                onPointerMove={handleTimelinePointerMove}
                onPointerLeave={handleTimelinePointerLeave}
              >
                <div className="timeline-preview" aria-hidden="true">
                  <div className={`timeline-preview-frame ${timelineStoryboardFrame ? 'has-storyboard' : 'has-thumbnail'}`}>
                    {timelineStoryboardFrame ? (
                      <span className="timeline-storyboard-frame" style={timelineStoryboardStyle} />
                    ) : (
                      timelinePreviewThumbnailSources[0] && (
                        <img
                          src={timelinePreviewThumbnailSources[0]}
                          data-fallback-srcs={timelinePreviewThumbnailSources.slice(1).join('|')}
                          onError={handleTimelinePreviewImageError}
                          alt=""
                        />
                      )
                    )}
                    <span className="timeline-preview-shade" />
                    <span className="timeline-preview-time">{formatTime(timelinePreview.time)}</span>
                  </div>
                </div>
                <input
                  className="timeline"
                  type="range"
                  min="0"
                  max={timelineMax}
                  step="0.1"
                  value={Math.min(displayTime, timelineMax)}
                  onChange={handleSeek}
                  onFocus={handleTimelineFocus}
                  onBlur={handleTimelineBlur}
                  disabled={!currentVideo || !canControlRoom}
                  aria-label="Video timeline"
                  aria-valuetext={`${formatTime(displayTime)} of ${formatTime(timelineMax)}`}
                />
              </div>
              <span className="time-code">{formatTime(timelineMax)}</span>

              <div className="volume-control" style={{ '--volume-level': `${audibleVolume}%` } as CSSProperties}>
                <button
                  className="volume-button"
                  type="button"
                  onClick={handleToggleMute}
                  title={audibleVolume === 0 ? 'Unmute' : 'Mute'}
                  aria-label={audibleVolume === 0 ? 'Unmute' : 'Mute'}
                >
                  {audibleVolume === 0 ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
                </button>
                <input
                  className="volume-slider"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={audibleVolume}
                  onChange={handleVolumeChange}
                  aria-label="Volume"
                  aria-valuetext={`${audibleVolume}%`}
                />
                <span className="volume-value">{audibleVolume}</span>
              </div>

              <span className={`sync-pill ${connected ? 'is-online' : 'is-offline'}`}>
                {connected ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}
                {connected ? `${latencyMs ?? 0} ms` : 'Offline'}
              </span>
              {currentVideo && !canControlRoom && (
                <span className="lock-pill" title={controlUnavailableMessage}>
                  <Lock size={14} aria-hidden="true" />
                  Host controls
                </span>
              )}
              {currentVideo && (
                <button
                  className="icon-button control-icon"
                  type="button"
                  onClick={handleResync}
                  title={controllerName ? `Sync to ${controllerName}` : 'Sync to room'}
                  aria-label={controllerName ? `Sync to ${controllerName}` : 'Sync to room'}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                </button>
              )}
              <button
                className="icon-button control-icon"
                type="button"
                onClick={handleToggleMiniPlayer}
                disabled={!currentVideo}
                title={miniPlayerActive ? 'Return to player' : 'Mini player'}
                aria-label={miniPlayerActive ? 'Return to full player' : 'Open mini player'}
              >
                {miniPlayerActive ? <Maximize2 size={17} aria-hidden="true" /> : <Minimize2 size={17} aria-hidden="true" />}
              </button>
              <button
                className="icon-button control-icon"
                type="button"
                onClick={handleToggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}
              </button>
              <button
                className={`icon-button control-icon mobile-chat-toggle ${chatOpen ? 'is-active' : ''}`}
                type="button"
                onClick={handleMobileChatButton}
                title={chatOpen ? 'Close chat' : 'Chat'}
                aria-label={chatOpen ? 'Close chat' : 'Open chat'}
              >
                <MessageCircle size={17} aria-hidden="true" />
              </button>
            </div>

            <div className="chat-feed" aria-live="polite">
              {recentMessages.map((message) => {
                const messageIsOwn = message.clientId === clientId
                const messageBody = message.body ? resolveEmojiShortcodes(message.body) : ''
                const messageIsLong = isLongChatBody(messageBody)

                return (
                  <article className={`chat-message ${messageIsOwn ? 'is-own' : 'is-other'} ${message.image ? 'has-image' : ''} ${messageIsLong ? 'is-long' : ''}`} key={message.id} style={{ '--chat-color': message.color } as CSSProperties}>
                    {messageBody && <span className="chat-body">{messageBody}</span>}
                    <span className="chat-meta">
                      <time dateTime={new Date(message.createdAt).toISOString()}>{formatMessageTime(message.createdAt)}</time>
                      <span className="chat-author">{messageIsOwn ? 'You' : message.name}</span>
                    </span>
                    {message.image && (
                      <button className="chat-image-button" type="button" onClick={() => setPreviewImage({ image: message.image as ChatImage, author: messageIsOwn ? 'You' : message.name })} aria-label="Open shared image">
                        <img src={message.image.dataUrl} alt={message.image.name || 'Shared image'} />
                      </button>
                    )}
                  </article>
                )
              })}
            </div>

            <form className={`chat-composer ${chatOpen ? 'is-open' : ''} ${emojiSuggestions.length > 0 ? 'has-emoji-suggestions' : ''} ${pendingImage ? 'has-attachment' : ''}`} onPointerEnter={handleGlassPointerMove} onPointerMove={handleGlassPointerMove} onPointerLeave={handleGlassPointerLeave} onSubmit={handleChatSubmit}>
              {pendingImage && (
                <div className="pending-attachment">
                  <img src={pendingImage.dataUrl} alt={pendingImage.name || 'Image attachment'} />
                  <span>{pendingImage.name || 'Image'}</span>
                  <button className="pending-remove" type="button" onClick={() => setPendingImage(null)} title="Remove image" aria-label="Remove image">
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
              <MessageCircle size={18} aria-hidden="true" />
              <input
                ref={chatInputRef}
                value={chatDraft}
                onChange={(event) => setChatDraft(event.currentTarget.value)}
                onKeyDown={handleChatInputKeyDown}
                onPaste={handleChatPaste}
                placeholder={pendingImage ? 'Add a caption' : 'Message the room'}
                aria-label="Message the room"
                enterKeyHint="send"
                autoCapitalize="sentences"
                maxLength={400}
              />
              <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleImageFileChange} />
              <button className="icon-button attachment-button" type="button" onClick={handleOpenImagePicker} disabled={uploadingImage} title="Attach image" aria-label="Attach image">
                {uploadingImage ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : <ImageIcon size={17} aria-hidden="true" />}
              </button>
              {emojiSuggestions.length > 0 && (
                <div className="emoji-suggestions" role="listbox" aria-label="Emoji suggestions">
                  {emojiSuggestions.map((option) => (
                    <button
                      className="emoji-suggestion"
                      key={option.name}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyEmojiSuggestion(option)}
                      role="option"
                      title={`:${option.name}:`}
                      aria-label={`Use :${option.name}:`}
                    >
                      <span className="emoji-symbol" aria-hidden="true">{option.emoji}</span>
                    </button>
                  ))}
                </div>
              )}
              <button className="icon-button send-button" type="submit" disabled={uploadingImage} title="Send" aria-label="Send message">
                <Send size={17} aria-hidden="true" />
              </button>
            </form>

            {isFullscreen && previewImage && (
              <div
                className="image-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label="Shared image preview"
                onPointerDown={handleImageLightboxBackdropEvent}
                onMouseDown={handleImageLightboxBackdropEvent}
                onTouchStart={handleImageLightboxBackdropEvent}
                onPointerUp={stopImageLightboxEvent}
                onMouseUp={stopImageLightboxEvent}
                onClick={handleImageLightboxBackdropClick}
              >
                <div
                  className="image-lightbox-content"
                  onPointerDown={stopImageLightboxEvent}
                  onMouseDown={stopImageLightboxEvent}
                  onTouchStart={stopImageLightboxEvent}
                  onPointerUp={stopImageLightboxEvent}
                  onMouseUp={stopImageLightboxEvent}
                  onClick={stopImageLightboxEvent}
                >
                  <img src={previewImage.image.dataUrl} alt={previewImage.image.name || 'Shared image'} />
                </div>
              </div>
            )}

          </div>

          <div className="now-row">
            <div className="now-copy">
              <p className="eyebrow">Room {roomId}</p>
              <h2>{currentVideo?.title ?? 'YouWatch'}</h2>
              <p>{currentVideo?.author ?? (connected ? `Joined as ${displayName}` : 'Connecting...')}</p>
            </div>
            <div className="member-strip" aria-label="Room members">
              {roomState?.members.map((member) => (
                <button
                  className={`member-avatar ${member.trusted ? 'is-trusted' : ''} ${member.clientId === roomState.ownerId ? 'is-owner' : ''} ${isOwner && member.clientId !== clientId ? 'can-toggle' : ''}`}
                  key={member.clientId}
                  type="button"
                  style={{ '--member-color': member.color } as CSSProperties}
                  onClick={() => handleToggleTrusted(member)}
                  disabled={!isOwner || member.clientId === clientId}
                  title={getMemberTitle(member, roomState.ownerId, isOwner && member.clientId !== clientId)}
                  aria-label={getMemberTitle(member, roomState.ownerId, isOwner && member.clientId !== clientId)}
                >
                  <span className="member-initial">{member.name.slice(0, 1).toUpperCase()}</span>
                  {member.clientId === roomState.ownerId ? <Crown className="member-role-icon" size={11} aria-hidden="true" /> : member.trusted ? <ShieldCheck className="member-role-icon" size={11} aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>

      {!isFullscreen && previewImage && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Shared image preview"
          onPointerDown={handleImageLightboxBackdropEvent}
          onMouseDown={handleImageLightboxBackdropEvent}
          onTouchStart={handleImageLightboxBackdropEvent}
          onPointerUp={stopImageLightboxEvent}
          onMouseUp={stopImageLightboxEvent}
          onClick={handleImageLightboxBackdropClick}
        >
          <div
            className="image-lightbox-content"
            onPointerDown={stopImageLightboxEvent}
            onMouseDown={stopImageLightboxEvent}
            onTouchStart={stopImageLightboxEvent}
            onPointerUp={stopImageLightboxEvent}
            onMouseUp={stopImageLightboxEvent}
            onClick={stopImageLightboxEvent}
          >
            <img src={previewImage.image.dataUrl} alt={previewImage.image.name || 'Shared image'} />
          </div>
        </div>
      )}

      {nameDialogOpen && (
        <div className="name-gate" role="dialog" aria-modal="true" aria-labelledby="name-gate-title">
          <form className="name-card" onSubmit={handleNameSubmit}>
            <span className="name-card-icon">
              <Users size={22} aria-hidden="true" />
            </span>
            <h2 id="name-gate-title">What should people call you?</h2>
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.currentTarget.value)}
              placeholder="Username"
              aria-label="Username"
              autoComplete="nickname"
              maxLength={24}
              autoFocus
            />
            <button className="name-submit" type="submit" disabled={!normalizeDisplayName(nameDraft)}>
              Join room
            </button>
          </form>
        </div>
      )}

      {notice && <div className="notice">{notice}</div>}
    </div>
  )
}

function useSpringValue(target: number) {
  const [value, setValue] = useState(target)
  const valueRef = useRef(target)
  const velocityRef = useRef(0)

  useEffect(() => {
    let animationFrame = 0

    const tick = () => {
      const displacement = target - valueRef.current
      velocityRef.current = velocityRef.current * 0.72 + displacement * 0.16
      valueRef.current += velocityRef.current

      if (Math.abs(displacement) < 0.001 && Math.abs(velocityRef.current) < 0.001) {
        valueRef.current = target
        velocityRef.current = 0
        setValue(target)
        return
      }

      setValue(valueRef.current)
      animationFrame = window.requestAnimationFrame(tick)
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [target])

  return value
}

async function analyzeImageComplexity(source: string): Promise<MaterialComplexity> {
  const image = await loadImage(source)
  const canvas = document.createElement('canvas')
  const width = 36
  const height = 20

  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    return 'busy'
  }

  context.drawImage(image, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height).data
  let luminanceTotal = 0
  let luminanceSquaredTotal = 0
  let edgeTotal = 0
  let previousLuminance = 0
  let sampleCount = 0

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue

    luminanceTotal += luminance
    luminanceSquaredTotal += luminance * luminance

    if (sampleCount > 0) {
      edgeTotal += Math.abs(luminance - previousLuminance)
    }

    previousLuminance = luminance
    sampleCount += 1
  }

  const mean = luminanceTotal / sampleCount
  const variance = luminanceSquaredTotal / sampleCount - mean * mean
  const edgeEnergy = edgeTotal / sampleCount

  if (variance > 2400 || edgeEnergy > 24) {
    return 'dense'
  }

  if (variance > 900 || edgeEnergy > 12) {
    return 'busy'
  }

  return 'simple'
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = source
  })
}

function loadYouTubeApi() {
  if (window.YT?.Player) {
    return Promise.resolve()
  }

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve) => {
      const previousCallback = window.onYouTubeIframeAPIReady

      window.onYouTubeIframeAPIReady = () => {
        previousCallback?.()
        resolve()
      }

      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script')
        script.src = 'https://www.youtube.com/iframe_api'
        script.async = true
        document.head.appendChild(script)
      }
    })
  }

  return youtubeApiPromise
}

function isUsableYouTubePlayer(player: YouTubePlayer | null): player is YouTubePlayer {
  return Boolean(
    player &&
      typeof player.loadVideoById === 'function' &&
      typeof player.cueVideoById === 'function' &&
      typeof player.playVideo === 'function' &&
      typeof player.pauseVideo === 'function' &&
      typeof player.seekTo === 'function' &&
      typeof player.getCurrentTime === 'function' &&
      typeof player.getDuration === 'function' &&
      typeof player.getPlayerState === 'function',
  )
}

function safeCurrentTime(player: YouTubePlayer | null) {
  if (!isUsableYouTubePlayer(player)) {
    return 0
  }

  const currentTime = player.getCurrentTime()
  return Number.isFinite(currentTime) ? currentTime : 0
}

function safeDuration(player: YouTubePlayer | null) {
  if (!isUsableYouTubePlayer(player)) {
    return 0
  }

  const playerDuration = player.getDuration()
  return Number.isFinite(playerDuration) && playerDuration > 0 ? playerDuration : 0
}

function setPlaybackRate(player: YouTubePlayer | null, rate: number) {
  if (!isUsableYouTubePlayer(player) || typeof player.setPlaybackRate !== 'function') {
    return
  }

  try {
    const currentRate = typeof player.getPlaybackRate === 'function' ? player.getPlaybackRate() : 1

    if (Math.abs(currentRate - rate) > 0.01) {
      player.setPlaybackRate(rate)
    }
  } catch {
    return
  }
}

function clampPlaybackTime(seconds: number, video?: VideoMeta | null, player?: YouTubePlayer | null) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const durationSeconds = safeDuration(player ?? null) || parseDurationSeconds(video?.duration)

  if (durationSeconds <= 0) {
    return safeSeconds
  }

  if (safeSeconds > durationSeconds + STALE_PLAYBACK_RESET_GRACE_SECONDS) {
    return 0
  }

  return Math.min(safeSeconds, Math.max(0, durationSeconds - PLAYBACK_END_BUFFER_SECONDS))
}

function clampVolume(value: number) {
  return Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : DEFAULT_VOLUME)))
}

function parseDurationSeconds(duration?: string) {
  if (!duration) {
    return 0
  }

  const parts = duration.split(':').map((part) => Number(part))

  if (parts.length === 0 || parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return 0
  }

  return parts.reduce((totalSeconds, part) => totalSeconds * 60 + part, 0)
}

function parseYouTubeVideoId(value: string) {
  const trimmedValue = value.trim()

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmedValue)) {
    return trimmedValue
  }

  try {
    const normalizedValue = /^https?:\/\//i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`
    const url = new URL(normalizedValue)
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      return validateYouTubeVideoId(url.pathname.split('/').filter(Boolean)[0] ?? '')
    }

    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const watchId = validateYouTubeVideoId(url.searchParams.get('v') ?? '')

      if (watchId) {
        return watchId
      }

      const pathParts = url.pathname.split('/').filter(Boolean)
      const embeddedIndex = pathParts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part))

      if (embeddedIndex >= 0) {
        return validateYouTubeVideoId(pathParts[embeddedIndex + 1] ?? '')
      }
    }
  } catch {
    return null
  }

  return null
}

function validateYouTubeVideoId(value: string) {
  return /^[a-zA-Z0-9_-]{11}$/.test(value) ? value : null
}

function canUseVideoSwipeGesture(pointerType: string) {
  return pointerType !== 'mouse' || window.matchMedia('(max-width: 720px)').matches
}

function getTimelinePreviewThumbnailSources(video?: VideoMeta | null) {
  if (!video?.id) {
    return []
  }

  return Array.from(
    new Set(
      [
        `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`,
        `https://i.ytimg.com/vi/${video.id}/hq720.jpg`,
        `https://i.ytimg.com/vi/${video.id}/sddefault.jpg`,
        video.thumbnail,
        `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      ].filter(Boolean),
    ),
  )
}

async function fetchVideoMeta(videoId: string): Promise<VideoMeta> {
  let response: Response

  try {
    response = await fetch(apiUrl(`/api/youtube/video?videoId=${encodeURIComponent(videoId)}`))
  } catch {
    return fetchOembedVideoMeta(videoId)
  }

  const payload = (await response.json()) as { video?: VideoMeta; message?: string }

  if (response.ok && payload.video) {
    return payload.video
  }

  if (response.status === 502 || response.status === 503) {
    return fetchOembedVideoMeta(videoId)
  }

  throw new Error(payload.message ?? 'This YouTube video cannot be loaded.')
}

async function fetchOembedVideoMeta(videoId: string): Promise<VideoMeta> {
  const response = await fetch(apiUrl(`/api/youtube/oembed?videoId=${encodeURIComponent(videoId)}`))
  const payload = (await response.json()) as { video?: VideoMeta; message?: string }

  if (response.ok && payload.video) {
    return payload.video
  }

  throw new Error(payload.message ?? 'This YouTube video cannot be loaded.')
}

async function fetchVideoStoryboard(videoId: string): Promise<VideoStoryboard> {
  const response = await fetch(apiUrl(`/api/youtube/storyboard?videoId=${encodeURIComponent(videoId)}`))
  const payload = (await response.json()) as { storyboard?: VideoStoryboard }

  if (!response.ok || !payload.storyboard || payload.storyboard.videoId !== videoId) {
    return { videoId, levels: [] }
  }

  return {
    videoId,
    levels: Array.isArray(payload.storyboard.levels) ? payload.storyboard.levels.filter(isStoryboardLevel) : [],
  }
}

function isStoryboardLevel(value: unknown): value is StoryboardLevel {
  const level = value as StoryboardLevel

  return (
    Boolean(level) &&
    Number.isFinite(level.level) &&
    Number.isFinite(level.width) &&
    Number.isFinite(level.height) &&
    Number.isFinite(level.count) &&
    Number.isFinite(level.columns) &&
    Number.isFinite(level.rows) &&
    Number.isFinite(level.intervalMs) &&
    level.width > 0 &&
    level.height > 0 &&
    level.count > 0 &&
    level.columns > 0 &&
    level.rows > 0 &&
    level.intervalMs > 0 &&
    typeof level.urlTemplate === 'string' &&
    level.urlTemplate.includes('{storyboard}')
  )
}

function getStoryboardFrame(storyboard: VideoStoryboard | null, seconds: number): StoryboardFrame | null {
  const level = getBestStoryboardLevel(storyboard)

  if (!level) {
    return null
  }

  const frameIndex = Math.min(level.count - 1, Math.max(0, Math.floor((Math.max(0, seconds) * 1000) / level.intervalMs)))
  const framesPerSheet = Math.max(1, level.columns * level.rows)
  const sheetIndex = Math.floor(frameIndex / framesPerSheet)
  const sheetFrameIndex = frameIndex % framesPerSheet

  return {
    imageUrl: level.urlTemplate.replace('{storyboard}', String(sheetIndex)),
    column: sheetFrameIndex % level.columns,
    columns: level.columns,
    row: Math.floor(sheetFrameIndex / level.columns),
    rows: level.rows,
  }
}

function getBestStoryboardLevel(storyboard: VideoStoryboard | null) {
  if (!storyboard?.levels.length) {
    return null
  }

  return (
    storyboard.levels
      .slice()
      .sort((leftLevel, rightLevel) => {
        const leftDistance = Math.abs(leftLevel.width - 320)
        const rightDistance = Math.abs(rightLevel.width - 320)
        return leftDistance - rightDistance || rightLevel.width - leftLevel.width
      })[0] ?? null
  )
}

function getStoryboardPositionPercent(index: number, total: number) {
  return total <= 1 ? 0 : (index / (total - 1)) * 100
}

function findClipboardImageFile(data: DataTransfer) {
  const files = Array.from(data.files)
  const directFile = files.find((file) => file.type.startsWith('image/'))

  if (directFile) {
    return directFile
  }

  return Array.from(data.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .find((file): file is File => Boolean(file)) ?? null
}

async function prepareChatImage(file: File): Promise<ChatImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Attach an image file.')
  }

  if (file.size > CHAT_IMAGE_MAX_SOURCE_BYTES) {
    throw new Error('That image is too large to share here.')
  }

  const image = await loadImageFromFile(file)
  const scale = Math.min(1, CHAT_IMAGE_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Unable to process this image.')
  }

  canvas.width = width
  canvas.height = height
  context.fillStyle = '#050609'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  for (const quality of CHAT_IMAGE_QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    const dataUrl = await blobToDataUrl(blob)
    const size = estimateDataUrlBytes(dataUrl)

    if (size <= CHAT_IMAGE_MAX_BYTES) {
      return {
        dataUrl,
        mimeType: 'image/jpeg',
        name: sanitizeImageName(file.name),
        width,
        height,
        size,
      }
    }
  }

  throw new Error('That image is too detailed to share here.')
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unable to read this image.'))
    }
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }

      reject(new Error('Unable to compress this image.'))
    }, type, quality)
  })
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Unable to encode this image.'))
    reader.readAsDataURL(blob)
  })
}

function estimateDataUrlBytes(dataUrl: string) {
  const payload = dataUrl.split(',')[1] ?? ''
  return Math.floor((payload.length * 3) / 4)
}

function sanitizeImageName(value: string) {
  return value.replace(/[^\w .()-]/g, '').trim().slice(0, 80)
}

function configureYouTubeIframe(player: YouTubePlayer) {
  if (typeof player.getIframe !== 'function') {
    return
  }

  const iframe = player.getIframe()

  if (!iframe) {
    return
  }

  iframe.removeAttribute('allowfullscreen')
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen')
  iframe.setAttribute('draggable', 'false')
  iframe.setAttribute('tabindex', '-1')
  iframe.referrerPolicy = 'strict-origin-when-cross-origin'
  iframe.style.outline = 'none'
  iframe.style.userSelect = 'none'
  iframe.style.setProperty('-webkit-user-select', 'none')
}

function applyPreferredPlaybackQuality(player: YouTubePlayer) {
  if (!player.setPlaybackQuality) {
    return
  }

  const availableQualities = player.getAvailableQualityLevels?.() ?? []
  const preferredQuality = availableQualities.includes(PREFERRED_PLAYBACK_QUALITY)
    ? PREFERRED_PLAYBACK_QUALITY
    : PLAYBACK_QUALITY_FALLBACKS.find((quality) => availableQualities.includes(quality)) ?? PREFERRED_PLAYBACK_QUALITY

  player.setPlaybackQuality(preferredQuality)
}

function getYouTubePlayerErrorMessage(errorCode: number) {
  switch (errorCode) {
    case 2:
      return 'YouTube rejected this video id. Error 2.'
    case 5:
      return 'YouTube could not play this in the HTML5 player. Error 5.'
    case 100:
      return 'This video is private, removed, or unavailable. Error 100.'
    case 101:
    case 150:
      return `The owner disabled embedded playback. Error ${errorCode}.`
    case 153:
      return 'YouTube rejected the embed referrer. Error 153.'
    default:
      return `YouTube playback failed. Error ${errorCode}.`
  }
}

function resolveInitialRoomId() {
  const hashRoomId = window.location.hash.replace('#', '').trim().toLowerCase()

  if (/^[a-z0-9-]{3,48}$/.test(hashRoomId)) {
    return hashRoomId
  }

  const roomId = `room-${randomToken(7)}`
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${roomId}`)
  return roomId
}

function getClientId() {
  const storedClientId = readLocalStorage(LOCAL_CLIENT_KEY)

  if (storedClientId) {
    return storedClientId
  }

  const clientId = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `client-${randomToken(16)}`
  writeLocalStorage(LOCAL_CLIENT_KEY, clientId)
  return clientId
}

function getStoredDisplayName() {
  const storedName = normalizeDisplayName(readLocalStorage(LOCAL_NAME_KEY))
  const confirmed = readLocalStorage(LOCAL_NAME_CONFIRMED_KEY) === '1'

  return confirmed ? storedName : ''
}

function normalizeDisplayName(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
}

function getStoredVolume() {
  const storedValue = readLocalStorage(LOCAL_VOLUME_KEY)
  const storedVolume = Number(storedValue)

  if (!storedValue) {
    return DEFAULT_VOLUME
  }

  return clampVolume(Number.isFinite(storedVolume) ? storedVolume : DEFAULT_VOLUME)
}

function readLocalStorage(key: string) {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

function randomToken(length: number) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'

  if (globalThis.crypto?.getRandomValues) {
    const randomValues = new Uint8Array(length)
    globalThis.crypto.getRandomValues(randomValues)
    return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('')
  }

  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function formatMessageTime(timestamp: number) {
  return messageTimeFormatter.format(new Date(timestamp))
}

function isLongChatBody(value: string) {
  const body = value.trim()
  return body.length > 52 || /\S{24,}/.test(body) || body.includes('\n')
}

function getControlUnavailableMessage(state: RoomState | null) {
  const ownerName = state?.ownerName?.trim()
  return ownerName ? `Only ${ownerName} and trusted viewers can control playback.` : 'Only the host and trusted viewers can control playback.'
}

function canControlPlaybackState(state: RoomState, clientId: string) {
  if (state.ownerId === clientId) {
    return true
  }

  return Boolean(state.members.find((member) => member.clientId === clientId)?.trusted)
}

function getMemberTitle(member: RoomMember, ownerId: string, canToggle: boolean) {
  if (member.clientId === ownerId) {
    return `${member.name} · Owner`
  }

  if (member.trusted) {
    return canToggle ? `${member.name} · Trusted · Click to remove control` : `${member.name} · Trusted`
  }

  return canToggle ? `${member.name} · Click to trust for controls` : member.name
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

export default App
