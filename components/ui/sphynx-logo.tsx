/** The Sphynx mark — the sand-gold pixel-grid cat. Used for every on-site logo
 *  (header, footer, docs). Same mask as public/sphynx-mark.png + app/icon.png. */
import { PixelSphynx } from "@/components/ui/pixel-sphynx";

export function SphynxLogo({ size = 34, className }: { size?: number; className?: string }) {
  return <PixelSphynx size={size} className={className} />;
}
