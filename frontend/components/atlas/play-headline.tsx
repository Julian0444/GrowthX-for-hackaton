// Componente NUEVO (aditivo, T3). Una línea grande arriba del drawer con
// play.headline. No reescribe nada existente.

import type { ReactElement } from "react"

export function PlayHeadline({ headline }: { headline: string }): ReactElement {
  return (
    <div
      className="play-headline"
      style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, margin: "0 0 12px" }}
    >
      {headline}
    </div>
  )
}
