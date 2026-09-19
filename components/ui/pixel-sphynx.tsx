/** The SPHYNX pixel mark — a sitting hairless cat drawn on a dot-grid, one
 *  source mask shared with public/sphynx-mark.png. Server-renderable. */
import { LIME } from "@/lib/brand";

const MASK = [
  "..##........##........",
  "..###......###........",
  "..####....####........",
  "..#####..#####........",
  "..############........",
  "..############........",
  "..############........",
  "..##o######o##........",
  "..############........",
  "...##########.........",
  "....########..........",
  ".....######...........",
  "....########..........",
  "...##########.........",
  "...###########........",
  "...############.....##",
  "...############....###",
  "...############...###.",
  "...############..###..",
  "....###########..###..",
  "....###############...",
  "....##....##..........",
  "....##....##..........",
  "...###...###.........."
];
const CELLS: [number, number][] = [];
const EYES: [number, number][] = []; // "o" — drawn in deep sand so they read as eyes, not holes
MASK.forEach((row, y) => [...row].forEach((c, x) => { if (c === "#") CELLS.push([x, y]); if (c === "o") EYES.push([x, y]); }));
const ORDER = CELLS.map((_, i) => i).sort((a, b) => CELLS[b][1] - CELLS[a][1] || CELLS[a][0] - CELLS[b][0]);
const W = 22, H = 24, CELL = 20, GAP = 3;

/** progress 0..1 lights the grid bottom-up, row by row, like a terminal booting;
 *  unlit cells stay as faint sockets so the silhouette is readable from 0%. */
export function PixelSphynx({ size = 34, color = LIME, eyeColor = "#A67C33", glow = true, className, progress }: { size?: number; color?: string; eyeColor?: string; glow?: boolean; className?: string; progress?: number }) {
  const lit = progress === undefined ? CELLS.length : Math.round(CELLS.length * Math.min(1, Math.max(0, progress)));
  // bottom-up order: sort by row descending, then x — stable across renders
  const order = ORDER;
  return (
    <svg
      viewBox={`0 0 ${W * CELL} ${H * CELL}`}
      width={size}
      height={size * (H / W)}
      className={className}
      aria-label="Sphynx"
      style={{ display: "block", flex: "none", filter: glow ? `drop-shadow(0 0 ${Math.max(2, size * 0.12)}px ${color}66)` : undefined }}
    >
      <g fill={color}>
        {order.map((ci, rank) => {
          const [x, y] = CELLS[ci];
          const on = rank < lit;
          return (
            <rect
              key={`${x}-${y}`}
              x={x * CELL + GAP / 2}
              y={y * CELL + GAP / 2}
              width={CELL - GAP}
              height={CELL - GAP}
              rx={3}
              opacity={on ? 1 : 0.14}
              style={{ transition: "opacity .25s ease" }}
            />
          );
        })}
      </g>
      <g fill={eyeColor}>
        {EYES.map(([x, y]) => (
          <rect key={`e${x}-${y}`} x={x * CELL + GAP / 2} y={y * CELL + GAP / 2} width={CELL - GAP} height={CELL - GAP} rx={3} opacity={progress === undefined || progress > 0.95 ? 1 : 0.14} style={{ transition: "opacity .25s ease" }} />
        ))}
      </g>
    </svg>
  );
}
