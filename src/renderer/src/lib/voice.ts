/**
 * Voz via WebRTC em malha (mesh): cada participante abre uma conexão
 * peer-to-peer com cada outro participante da sala. O servidor só repassa
 * as mensagens de sinalização (offer / answer / ICE candidates).
 *
 * Funciona bem para salas pequenas (até ~8 pessoas). Para salas grandes,
 * o próximo passo seria um SFU (ex.: mediasoup ou LiveKit).
 */
import type { JoinVoiceResult, SignalData } from '@shared/types'
import { useApp } from '@/store'
import type { AppSocket } from './core'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  // Para conectar pessoas atrás de NATs restritivos, adicione um servidor TURN:
  // { urls: 'turn:seu-servidor:3478', username: 'usuario', credential: 'senha' }
]

const SPEAKING_THRESHOLD = 0.015
const METER_INTERVAL_MS = 120

interface Peer {
  pc: RTCPeerConnection
  audio: HTMLAudioElement
}

interface Meter {
  source: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  buffer: Float32Array<ArrayBuffer>
}

class VoiceClient {
  private socket: AppSocket | null = null
  private local: MediaStream | null = null
  private channelId: string | null = null
  private peers = new Map<string, Peer>()
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>()
  private ctx: AudioContext | null = null
  private meters = new Map<string, Meter>()
  private meterTimer: number | null = null
  private muted = false
  private deafened = false

  setSocket(socket: AppSocket | null): void {
    this.socket = socket
  }

  /**
   * Entra na sala. Se o microfone não estiver disponível (sem dispositivo,
   * permissão negada, em uso por outro programa), entra mesmo assim só para
   * ouvir e devolve o erro em `micError` para a UI avisar o usuário.
   */
  async join(channelId: string): Promise<{ micError: unknown }> {
    const socket = this.socket
    if (!socket) throw new Error('Sem conexão com o servidor')

    this.teardown()

    let local: MediaStream | null = null
    let micError: unknown = null
    try {
      local = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      })
      local.getAudioTracks().forEach((t) => (t.enabled = !this.muted))
    } catch (err) {
      micError = err
      console.warn('[voz] sem microfone, entrando só para ouvir:', err)
    }
    const stopLocal = (): void => local?.getTracks().forEach((t) => t.stop())

    let res: JoinVoiceResult
    try {
      res = await socket.emitWithAck('voice:join', {
        channelId,
        muted: this.muted || !local,
        deafened: this.deafened
      })
    } catch (err) {
      stopLocal()
      throw err
    }
    if (!res.ok) {
      stopLocal()
      throw new Error(res.error)
    }

    this.local = local
    this.channelId = channelId

    const selfId = useApp.getState().self?.id
    if (selfId && local) this.watch(selfId, local)
    this.startMeter()

    // Quem entra liga para quem já está na sala.
    for (const peerId of res.peers) void this.call(peerId)
    return { micError }
  }

  leave(): void {
    if (this.channelId) this.socket?.emit('voice:leave')
    this.teardown()
  }

  /** Fecha tudo localmente, sem avisar o servidor. */
  teardown(): void {
    for (const id of [...this.peers.keys()]) this.removePeer(id)
    this.pendingCandidates.clear()
    this.local?.getTracks().forEach((t) => t.stop())
    this.local = null
    for (const id of [...this.meters.keys()]) this.unwatch(id)
    this.stopMeter()
    this.channelId = null
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !muted))
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened
    for (const peer of this.peers.values()) peer.audio.muted = deafened
  }

  async handleSignal({ from, data }: { from: string; data: SignalData }): Promise<void> {
    if (!this.channelId) return
    try {
      if (data.type === 'offer') {
        const peer = this.peers.get(from) ?? this.createPeer(from)
        await peer.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
        const answer = await peer.pc.createAnswer()
        await peer.pc.setLocalDescription(answer)
        this.signal(from, { type: 'answer', sdp: answer.sdp ?? '' })
        await this.flushCandidates(from)
      } else if (data.type === 'answer') {
        const peer = this.peers.get(from)
        if (!peer) return
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
        await this.flushCandidates(from)
      } else {
        const peer = this.peers.get(from)
        if (peer?.pc.remoteDescription) {
          await peer.pc.addIceCandidate(data.candidate)
        } else {
          const list = this.pendingCandidates.get(from) ?? []
          list.push(data.candidate)
          this.pendingCandidates.set(from, list)
        }
      }
    } catch (err) {
      console.error('[voz] erro na sinalização com', from, err)
    }
  }

  removePeer(id: string): void {
    const peer = this.peers.get(id)
    if (peer) {
      peer.pc.close()
      peer.audio.pause()
      peer.audio.srcObject = null
      this.peers.delete(id)
    }
    this.pendingCandidates.delete(id)
    this.unwatch(id)
  }

  // ---------- internos ----------

  private signal(to: string, data: SignalData): void {
    this.socket?.emit('voice:signal', { to, data })
  }

  private createPeer(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const audio = new Audio()
    audio.autoplay = true
    audio.muted = this.deafened
    const peer: Peer = { pc, audio }

    const local = this.local
    if (local) local.getTracks().forEach((track) => pc.addTrack(track, local))

    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal(id, { type: 'candidate', candidate: e.candidate.toJSON() })
    }
    pc.ontrack = (e) => {
      const [stream] = e.streams
      if (!stream) return
      audio.srcObject = stream
      audio.play().catch(() => {})
      this.watch(id, stream)
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') console.warn('[voz] conexão falhou com', id)
    }

    this.peers.set(id, peer)
    return peer
  }

  private async call(id: string): Promise<void> {
    try {
      const { pc } = this.createPeer(id)
      // Sem microfone não há faixa local, e uma offer sem nenhuma faixa não
      // negocia áudio: pedimos explicitamente para só receber.
      if (!this.local) pc.addTransceiver('audio', { direction: 'recvonly' })
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.signal(id, { type: 'offer', sdp: offer.sdp ?? '' })
    } catch (err) {
      console.error('[voz] não foi possível ligar para', id, err)
    }
  }

  private async flushCandidates(id: string): Promise<void> {
    const peer = this.peers.get(id)
    const list = this.pendingCandidates.get(id)
    this.pendingCandidates.delete(id)
    if (!peer || !list) return
    for (const candidate of list) await peer.pc.addIceCandidate(candidate)
  }

  // ---------- indicador de quem está falando ----------

  private watch(id: string, stream: MediaStream): void {
    this.unwatch(id)
    if (!this.ctx) this.ctx = new AudioContext()
    void this.ctx.resume()
    const source = this.ctx.createMediaStreamSource(stream)
    const analyser = this.ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    this.meters.set(id, { source, analyser, buffer: new Float32Array(analyser.fftSize) })
  }

  private unwatch(id: string): void {
    const meter = this.meters.get(id)
    if (!meter) return
    meter.source.disconnect()
    this.meters.delete(id)
  }

  private startMeter(): void {
    this.stopMeter()
    this.meterTimer = window.setInterval(() => this.tick(), METER_INTERVAL_MS)
  }

  private stopMeter(): void {
    if (this.meterTimer !== null) window.clearInterval(this.meterTimer)
    this.meterTimer = null
    if (Object.keys(useApp.getState().speaking).length) useApp.setState({ speaking: {} })
  }

  private tick(): void {
    const selfId = useApp.getState().self?.id
    const prev = useApp.getState().speaking
    const next: Record<string, boolean> = {}

    for (const [id, meter] of this.meters) {
      meter.analyser.getFloatTimeDomainData(meter.buffer)
      let sum = 0
      for (const v of meter.buffer) sum += v * v
      const rms = Math.sqrt(sum / meter.buffer.length)
      const silenced = id === selfId ? this.muted : this.deafened
      if (rms > SPEAKING_THRESHOLD && !silenced) next[id] = true
    }

    const prevKeys = Object.keys(prev)
    const nextKeys = Object.keys(next)
    const changed = prevKeys.length !== nextKeys.length || nextKeys.some((k) => !prev[k])
    if (changed) useApp.setState({ speaking: next })
  }
}

export const voice = new VoiceClient()
