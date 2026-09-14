'use client'
import { useEffect, useRef, type ReactNode } from 'react'

// Modeless on desktop so list/map stay usable. Native modal on mobile gives
// keyboard trapping and inert background without a second selection model.
export function EvidencePanel({ children, onClose, identity }: { children: ReactNode; onClose: () => void; identity: string }) {
  const panel = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = panel.current!
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const media = window.matchMedia('(max-width: 700px)')
    const show = () => { element.close(); if (media.matches) element.showModal(); else element.show(); close.current?.focus() }
    show(); media.addEventListener('change', show)
    return () => { media.removeEventListener('change', show); element.close(); if (trigger?.isConnected) trigger.focus({preventScroll: true}) }
  }, [])
  useEffect(() => { panel.current?.scrollTo({top: 0}); close.current?.focus() }, [identity])
  return <dialog ref={panel} className="evidence-panel" aria-label="Research evidence" onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() } }}>
    <header><span>Evidence · saved revision</span><button ref={close} className="research-button" onClick={onClose}>Close evidence</button></header>
    {children}
  </dialog>
}
