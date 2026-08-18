"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import {
  clampZoom,
  coverScale,
  easeCam,
  FRAME_IDLE,
  type CameraFrame,
} from "@/lib/atlas/camera"
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/atlas/signal-layout"

export type ZoomBand = { zoomed: boolean; zoomed2: boolean }

export type AtlasCamera = {
  stageRef: React.RefObject<HTMLDivElement | null>
  groupRef: React.RefObject<SVGGElement | null>
  registerMarker: (id: string, node: SVGGElement | null) => void
  flyTo: (target: CameraFrame, ms?: number) => void
  zoomBy: (factor: number) => void
  stopFlight: () => void
}

// Cámara imperativa (lógica del prototipo): el vuelo por rAF y el counter-scale de
// los marcadores mutan el DOM directamente — cero re-renders de React por frame.
export function useAtlasCamera({
  reducedMotion,
  onZoomBandChange,
}: {
  reducedMotion: boolean
  onZoomBandChange: (band: ZoomBand) => void
}): AtlasCamera {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const groupRef = useRef<SVGGElement | null>(null)
  const markersRef = useRef(new Map<string, SVGGElement>())
  const camRef = useRef<CameraFrame>({ ...FRAME_IDLE })
  const flightRef = useRef<number | null>(null)
  const bandRef = useRef<ZoomBand>({ zoomed: false, zoomed2: false })
  const reducedRef = useRef(reducedMotion)
  const onBandRef = useRef(onZoomBandChange)

  useEffect(() => {
    reducedRef.current = reducedMotion
  }, [reducedMotion])
  useEffect(() => {
    onBandRef.current = onZoomBandChange
  }, [onZoomBandChange])

  const applyCam = useCallback(() => {
    const group = groupRef.current
    if (!group) return
    const cam = camRef.current
    const s = coverScale(window.innerWidth, window.innerHeight)
    const tx = MAP_WIDTH / 2 - cam.offX / s - cam.x * cam.k
    const ty = MAP_HEIGHT / 2 - cam.offY / s - cam.y * cam.k
    group.setAttribute("transform", `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${cam.k.toFixed(4)})`)
    const inverse = (1 / cam.k).toFixed(4)
    for (const marker of markersRef.current.values()) {
      marker.setAttribute("transform", `scale(${inverse})`)
    }
    const band: ZoomBand = { zoomed: cam.k > 1.7, zoomed2: cam.k > 2.2 }
    if (band.zoomed !== bandRef.current.zoomed || band.zoomed2 !== bandRef.current.zoomed2) {
      bandRef.current = band
      onBandRef.current(band)
    }
  }, [])

  const stopFlight = useCallback(() => {
    if (flightRef.current !== null) {
      cancelAnimationFrame(flightRef.current)
      flightRef.current = null
    }
  }, [])

  const flyTo = useCallback(
    (target: CameraFrame, ms = 850) => {
      stopFlight()
      const duration = reducedRef.current ? 0 : ms
      const to = { ...target }
      if (duration === 0) {
        camRef.current = to
        applyCam()
        return
      }
      const from = { ...camRef.current }
      const start = performance.now()
      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / duration)
        const eased = easeCam(progress)
        camRef.current = {
          x: from.x + (to.x - from.x) * eased,
          y: from.y + (to.y - from.y) * eased,
          k: from.k + (to.k - from.k) * eased,
          offX: from.offX + (to.offX - from.offX) * eased,
          offY: from.offY + (to.offY - from.offY) * eased,
        }
        applyCam()
        flightRef.current = progress < 1 ? requestAnimationFrame(step) : null
      }
      flightRef.current = requestAnimationFrame(step)
    },
    [applyCam, stopFlight],
  )

  const zoomBy = useCallback(
    (factor: number) => {
      const cam = camRef.current
      flyTo({ ...cam, k: clampZoom(cam.k * factor) }, 420)
    },
    [flyTo],
  )

  const registerMarker = useCallback((id: string, node: SVGGElement | null) => {
    if (node) {
      markersRef.current.set(id, node)
      node.setAttribute("transform", `scale(${(1 / camRef.current.k).toFixed(4)})`)
    } else {
      markersRef.current.delete(id)
    }
  }, [])

  // Drag + wheel propios: cancelan el vuelo en curso y NO cierran el panel (§6);
  // la rueda queda clampeada a [1, 9] (antes el zoom nativo de react-simple-maps no lo estaba).
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let drag: { x: number; y: number } | null = null

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      if (event.target instanceof Element && event.target.closest(".marker")) return
      drag = { x: event.clientX, y: event.clientY }
      stage.classList.add("dragging")
      stopFlight()
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!drag) return
      const cam = camRef.current
      const s = coverScale(window.innerWidth, window.innerHeight)
      camRef.current = {
        ...cam,
        x: cam.x - (event.clientX - drag.x) / (s * cam.k),
        y: cam.y - (event.clientY - drag.y) / (s * cam.k),
      }
      drag = { x: event.clientX, y: event.clientY }
      applyCam()
    }
    const onPointerUp = () => {
      drag = null
      stage.classList.remove("dragging")
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      stopFlight()
      const cam = camRef.current
      camRef.current = { ...cam, k: clampZoom(cam.k * Math.pow(1.0016, -event.deltaY)) }
      applyCam()
    }
    const onResize = () => applyCam()

    stage.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    stage.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("resize", onResize)
    return () => {
      stage.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      stage.removeEventListener("wheel", onWheel)
      window.removeEventListener("resize", onResize)
    }
  }, [applyCam, stopFlight])

  useLayoutEffect(() => {
    applyCam()
  }, [applyCam])

  useEffect(() => stopFlight, [stopFlight])

  return useMemo(
    () => ({ stageRef, groupRef, registerMarker, flyTo, zoomBy, stopFlight }),
    [registerMarker, flyTo, zoomBy, stopFlight],
  )
}
