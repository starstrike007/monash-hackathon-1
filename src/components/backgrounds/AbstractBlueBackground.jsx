import { useId } from 'react'

import { cn } from '@/lib/utils'

/**
 * A quiet, static background of layered translucent "silk" waves in a single
 * pale blue family (#d5e4ff). Layers follow one broad diagonal flow from the
 * upper-left to the lower-right; each layer fills the region above its curve,
 * so tone accumulates toward the upper-right while the lower-left stays almost
 * white. Everything is generated deterministically (seeded), so it renders the
 * same every time, and it is plain SVG (no raster, no animation).
 */

// --- deterministic helpers ---------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const fmt = (value) => Math.round(value * 10) / 10

/** Catmull-Rom spline through `points`, returned as cubic Bezier path commands. */
function smoothCurve(points, tension = 1) {
  let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension
    d += ` C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2[0])} ${fmt(p2[1])}`
  }
  return d
}

function buildComposition({ width: W, height: H, seed, layers: count }) {
  const rng = mulberry32(seed)
  const steps = 7
  const layers = []

  for (let i = 0; i < count; i += 1) {
    // Spread layers across the diagonal with a little irregularity.
    const t = Math.min(1, Math.max(0, (i + (rng() - 0.5) * 0.7) / (count - 1)))
    const left = H * (-0.32 + 0.9 * t ** 1.45 + (rng() - 0.5) * 0.06)
    const right = H * (0.12 + 1.2 * t ** 0.95 + (rng() - 0.5) * 0.08)
    const hero = i === Math.round((count - 1) * 0.55)
    const lower = i === Math.round((count - 1) * 0.86)
    const amplitude = H * (hero ? 0.11 : lower ? 0.075 : 0.026 + rng() * 0.04)
    const cycles = hero ? 1.15 : lower ? 1.0 : 0.8 + rng() * 0.6
    const phase = rng() * Math.PI * 2

    const points = []
    for (let s = 0; s <= steps; s += 1) {
      const u = s / steps
      const x = W * (-0.12 + 1.24 * u)
      const base = left + (right - left) * (u + 0.05 * Math.sin(u * Math.PI * 2 + phase))
      const wave =
        amplitude * Math.sin(phase + u * Math.PI * 2 * cycles) * (0.5 + 0.5 * Math.sin(u * Math.PI))
      points.push([x, base + wave + (rng() - 0.5) * H * 0.012])
    }

    const curve = smoothCurve(points)
    const last = points[points.length - 1]
    const first = points[0]
    const fill = `${curve} L${fmt(last[0])} ${fmt(-H * 0.3)} L${fmt(first[0])} ${fmt(-H * 0.3)} Z`

    // Alternate deeper-blue and white layers so the folds read as fabric, not bands.
    const light = i % 3 === 1
    layers.push({
      key: i,
      curve,
      fill,
      light,
      opacity: light ? 0.1 + rng() * 0.16 : 0.05 + rng() * 0.09,
      line: i % 3 === 2 || i % 7 === 0 ? null : i % 4 === 1 ? 'shade' : 'highlight',
      lineOpacity: 0.3 + rng() * 0.3,
    })
  }
  return layers
}

// One composition for wide screens, one authored for portrait phones.
const WIDE = { width: 1600, height: 900, seed: 20260921, layers: 14 }
const TALL = { width: 900, height: 1600, seed: 7241, layers: 11 }
const WIDE_LAYERS = buildComposition(WIDE)
const TALL_LAYERS = buildComposition(TALL)

// --- rendering ---------------------------------------------------------------

function WaveSvg({ composition, layers, className, uid }) {
  const { width: W, height: H } = composition
  const id = (name) => `${uid}-${name}`
  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
    >
      <defs>
        {/* Base wash: deeper at the upper-right, almost white at the lower-left. */}
        <linearGradient
          id={id('base')}
          gradientUnits="userSpaceOnUse"
          x1={W}
          y1={0}
          x2={W * 0.08}
          y2={H}
        >
          <stop offset="0" stopColor="#c8dcfb" />
          <stop offset="0.3" stopColor="#d5e4ff" />
          <stop offset="0.6" stopColor="#e9f1ff" />
          <stop offset="1" stopColor="#f9fbff" />
        </linearGradient>
        {/* Deeper-blue layers fade out toward the lower-left. */}
        <linearGradient
          id={id('deep')}
          gradientUnits="userSpaceOnUse"
          x1={W}
          y1={0}
          x2={W * 0.5}
          y2={H * 0.55}
        >
          <stop offset="0" stopColor="#a9c5f4" stopOpacity="1" />
          <stop offset="0.55" stopColor="#b6cff8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#d5e4ff" stopOpacity="0" />
        </linearGradient>
        {/* White layers are strongest through the middle, softening at the edges. */}
        <linearGradient
          id={id('light')}
          gradientUnits="userSpaceOnUse"
          x1={W * 0.1}
          y1={H}
          x2={W * 0.9}
          y2={0}
        >
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id={id('edge')} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={W} y2={H}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="0.75" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('shade')} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={W} y2={H}>
          <stop offset="0" stopColor="#8fb1ee" stopOpacity="0" />
          <stop offset="0.4" stopColor="#8fb1ee" stopOpacity="1" />
          <stop offset="1" stopColor="#8fb1ee" stopOpacity="0" />
        </linearGradient>
        <filter
          id={id('soft')}
          filterUnits="userSpaceOnUse"
          x={-W * 0.4}
          y={-H * 0.4}
          width={W * 1.8}
          height={H * 1.8}
        >
          <feGaussianBlur stdDeviation={Math.round(Math.max(W, H) / 45)} />
        </filter>
      </defs>

      <rect width={W} height={H} fill={`url(#${id('base')})`} />

      {layers.map((layer) => (
        <path
          key={`f${layer.key}`}
          d={layer.fill}
          fill={`url(#${id(layer.light ? 'light' : 'deep')})`}
          fillOpacity={layer.opacity}
        />
      ))}

      {/* Two wide, blurred sheens give the silk its body and open up the lower-left. */}
      {[0.55, 0.86].map((position, index) => (
        <path
          key={position}
          d={layers[Math.floor(layers.length * position)].curve}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={index === 0 ? 0.4 : 0.55}
          strokeWidth={Math.round(H / (index === 0 ? 7 : 5))}
          strokeLinecap="round"
          filter={`url(#${id('soft')})`}
        />
      ))}

      {layers.map((layer) =>
        layer.line ? (
          <path
            key={`l${layer.key}`}
            d={layer.curve}
            fill="none"
            stroke={`url(#${id(layer.line === 'highlight' ? 'edge' : 'shade')})`}
            strokeOpacity={layer.line === 'highlight' ? layer.lineOpacity : layer.lineOpacity * 0.3}
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
          />
        ) : null,
      )}
    </svg>
  )
}

/**
 * Drop behind any section: <AbstractBlueBackground className="absolute inset-0" />
 * (use `fixed inset-0 -z-10` inside an `isolate` wrapper for a full-page backdrop).
 */
export function AbstractBlueBackground({ className }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none overflow-hidden bg-[#d5e4ff]', className)}
    >
      <WaveSvg
        uid={`${uid}w`}
        composition={WIDE}
        layers={WIDE_LAYERS}
        className="absolute inset-0 hidden h-full w-full sm:block"
      />
      <WaveSvg
        uid={`${uid}t`}
        composition={TALL}
        layers={TALL_LAYERS}
        className="absolute inset-0 h-full w-full sm:hidden"
      />
    </div>
  )
}
