"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { getLenis } from "@/lib/lenis-store";
import { Reveal, RevealLines, RevealChars } from "@/components/vx/reveal-text";
import { REQUEST_ACCESS_URL, VAULT_URL } from "@/lib/links";
import "./vx.css";

const Diorama = dynamic(() => import("@/components/vx/diorama"), { ssr: false });
import { PixelSphynx } from "@/components/ui/pixel-sphynx";
import { RefusalCounter, RiddleCard, RefusalTicker, KeyStatus, ContractStrip } from "@/components/refusal-widgets";

/* Sphynx mark, the sand-gold Sphynx cat-head mark, shared by the header, preloader
   and section marks (same asset as the favicon). */
function VMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/sphynx-mark.png"
      alt="Sphynx"
      aria-hidden="true"
      className={`vx-vmark ${className ?? ""}`}
    />
  );
}

const ArrowUpRight = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M8 6h10v10h-2.2V9.8L6.6 18.8 5.2 17.4 14.2 8.2H8z" />
  </svg>
);

const SECTIONS = [
  { id: "vx-hero", label: "Top" },
  { id: "vx-desk", label: "The Gate" },
  { id: "vx-angles", label: "The Riddle" },
  { id: "vx-built", label: "The Key" },
  { id: "vx-signals", label: "The Storm" },
  { id: "vx-decide", label: "The No" },
  { id: "vx-view", label: "In Stone" },
  { id: "vx-run", label: "Access" },
];

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const l = getLenis();
  if (l) l.scrollTo(el, { offset: 0, duration: 1.4 });
  // no Lenis == the user prefers reduced motion, jump, don't animate
  else el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

/* small diamond glyph for the "built for" trio icons */
const Diamond = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 2l10 10-10 10L2 12z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12 7l5 5-5 5-5-5z" />
  </svg>
);

/* mono micro-index eyebrow, the explanatory spine that lets a first-time
   visitor follow the story act by act. Tick · number · section name. */
function IndexLabel({ n, children, i = 0 }: { n: string; children: string; i?: number }) {
  return (
    <Reveal className="vx-index" i={i}>
      <span className="vx-index__tick" aria-hidden="true" />
      <span className="vx-index__n">{n}</span>
      <span className="vx-index__label">{children}</span>
    </Reveal>
  );
}

/**
 * Scroll-linked choreography, the vvvhound trick. Every RAF we compute each
 * section's progress through its runway (0 pinned-in → 1 about to unpin) and
 * write transform/opacity directly, so the CONTENT scrubs with the scroll
 * exactly like the WebGL scene behind it. Enter-once blur reveals still run
 * on top for the first impression; this drives the continuous motion.
 */
function useScrollChoreography(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const secs = Array.from(document.querySelectorAll<HTMLElement>(".vx-sec"));
    const inners = secs.map((s) => s.querySelector<HTMLElement>(".vx-sec__inner"));
    let raf = 0;

    const tick = () => {
      const vh = window.innerHeight;
      for (let i = 0; i < secs.length; i++) {
        const inner = inners[i];
        if (!inner) continue;
        const r = secs[i].getBoundingClientRect();
        const total = r.height - vh;
        const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0.5;

        // content drifts up through its act; eases in/out at the seams
        const drift = (p - 0.5) * -40; // gentler travel, calmer read
        // No scroll fade: copy stays fully opaque for its whole act.
        const o = 1;
        const scale = i === 0 ? 1 - p * 0.06 : 1; // hero gently recedes

        inner.style.transform = `translate3d(0, ${drift.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
        inner.style.opacity = o.toFixed(3);
        // gate the blur-in reveals: they play once the act is actually pinned
        // (the hero counts as live immediately, the preloader gates it)
        inner.classList.toggle("vx-live", i === 0 || p > 0.001);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      for (const inner of inners) {
        if (inner) {
          inner.style.transform = "";
          inner.style.opacity = "";
          inner.classList.add("vx-live"); // never leave reveals locked shut
        }
      }
    };
  }, [enabled]);
}

/** Heavier, more cinematic smooth-scroll while this page is mounted. */
function useCinematicLenis() {
  useEffect(() => {
    const l = getLenis();
    if (!l) return;
    const prevLerp = l.options.lerp;
    l.options.lerp = 0.085;
    return () => {
      l.options.lerp = prevLerp;
    };
  }, []);
}

export default function HomePage() {
  const [pct, setPct] = useState(0);
  const [ready, setReady] = useState(false);
  const [mount3d, setMount3d] = useState(false);
  const [active, setActive] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  // flipped true by the WebGL scene once it has actually painted its first frame
  const sceneReady = useRef(false);
  const handleSceneReady = useCallback(() => {
    sceneReady.current = true;
  }, []);

  useCinematicLenis();
  useScrollChoreography(ready);

  // Mount the heavy WebGL scene (three.js eval + 12 procedural peaks + texture
  // remap + shader compile) a beat AFTER the preloader has painted, so its
  // synchronous init never delays the loader's own first frame. It then builds
  // BEHIND the still-opaque preloader; we only lift the preloader once the scene
  // has actually painted (see the honest counter below).
  useEffect(() => {
    const id = setTimeout(() => setMount3d(true), 220);
    return () => clearTimeout(id);
  }, []);

  // Honest preloader. The counter eases up to ~90% during the intro, then HOLDS
  // there while the world is still building, if it isn't loaded yet, we keep
  // loading, and only completes to 100% (and lifts the veil) once the scene
  // reports its first painted frame. A safety cap dismisses it if that signal
  // never arrives, so a missing asset can't strand the page on the loader.
  useEffect(() => {
    let raf = 0;
    let start = 0;
    let cur = 0;
    let settled = false;
    let safety: ReturnType<typeof setTimeout> | undefined;
    const MIN_MS = 900; // graceful floor, even on an instant/cached load
    const finish = () => {
      if (settled) return;
      settled = true;
      cancelAnimationFrame(raf);
      if (safety) clearTimeout(safety);
      setPct(100);
      setTimeout(() => setReady(true), 260);
    };
    const tick = (t: number) => {
      if (!start) start = t;
      const elapsed = t - start;
      // intro creep 0→90 (easeOut) over ~1200ms, then parked at 90
      const introP = Math.min(1, elapsed / 1200);
      const introTarget = 90 * (1 - Math.pow(1 - introP, 3));
      const canFinish = sceneReady.current && elapsed >= MIN_MS;
      const target = canFinish ? 100 : introTarget;
      cur += (target - cur) * 0.12;
      if (canFinish && cur > 99.3) return finish();
      setPct(Math.round(cur));
      raf = requestAnimationFrame(tick);
    };
    // never strand the user on the loader if the scene never signals ready
    safety = setTimeout(finish, 9000);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (safety) clearTimeout(safety);
    };
  }, []);

  // scroll progress + active section
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const frac = max > 0 ? window.scrollY / max : 0;
      if (barRef.current) barRef.current.style.width = `${frac * 100}%`;
      // condense the header + reveal its hairline once we leave the hero top
      if (headerRef.current) headerRef.current.classList.toggle("is-scrolled", window.scrollY > 24);
      const mid = window.scrollY + window.innerHeight * 0.5;
      let idx = 0;
      for (let i = 0; i < SECTIONS.length; i++) {
        const el = document.getElementById(SECTIONS[i].id);
        if (el && el.offsetTop <= mid) idx = i;
      }
      setActive(idx);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="vx-root">
      {/* preloader, V mark inside a green progress ring, serif % counter */}
      <div className={`vx-preload ${ready ? "is-done" : ""}`}>
        <div className="vx-preload__mark">
          <div className="vx-preload__ring" style={{ "--pct": pct }} aria-hidden="true" />
          <PixelSphynx size={64} progress={pct / 100} className="vx-vmark" />
        </div>
        <div className="vx-preload__pct">
          {pct}<span className="vx-preload__sign">%</span>
        </div>
      </div>

      {/* WebGL scene + veils, mounted behind the preloader, which lifts only
          once the scene reports its first painted frame (see onReady) */}
      {mount3d && <Diorama onReady={handleSceneReady} />}
      <div className="vx-veil" aria-hidden="true" />
      <div className="vx-grain" aria-hidden="true" />

      {/* scroll progress */}
      <div className="vx-progress" ref={barRef} aria-hidden="true" />

      {/* header */}
      <header className="vx-header" ref={headerRef}>
        <a className="vx-logo" href="/" aria-label="Sphynx home">
          <VMark />
          <span>SPHYNX</span>
        </a>
        <nav className="vx-nav">
          <a className="vx-nav-link vx-nav-hide" href="/refusals"><span>Refusals</span></a>
          <a className="vx-nav-link vx-nav-hide" href="/docs"><span>Docs</span></a>
          <a className="vx-nav-cta" href={REQUEST_ACCESS_URL}>
            <span>Connect wallet</span>
            <ArrowUpRight />
          </a>
        </nav>
      </header>

      {/* section navigator */}
      <div className="vx-navdots" role="navigation" aria-label="Sections">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            className={i === active ? "is-active" : ""}
            aria-label={s.label}
            aria-current={i === active}
            onClick={() => scrollToId(s.id)}
          >
            <span className="vx-navdots__dot" aria-hidden="true" />
            <span className="vx-navdots__label" aria-hidden="true">{s.label}</span>
          </button>
        ))}
      </div>

      {/* ── HERO ── */}
      <section className="vx-sec vx-h-hero" id="vx-hero">
        <div className="vx-sec__inner">
          <div className="vx-hud" aria-hidden="true">
            <span className="vx-hud__tick vx-hud__tick--tl" />
            <span className="vx-hud__tick vx-hud__tick--tr" />
            <span className="vx-hud__tick vx-hud__tick--bl" />
            <span className="vx-hud__tick vx-hud__tick--br" />
          </div>
          <Reveal className="vx-eyebrow" i={0}>
            <span className="vx-eyebrow__tick" aria-hidden="true" />
            Stock tokens · 24/7 · mainnet · unaudited · unaffiliated with Robinhood
          </Reveal>
          <RevealChars text="SPHYNX" as="h1" className="vx-hero-title" step={70} />
          <Reveal className="vx-sub vx-sub--hero" i={4} style={{ marginTop: "0.4em", maxWidth: "46ch" }}>
            Markets never close now. Neither does the gatekeeper. Your agent researches
            around the clock; on Robinhood you still approve every order; on-chain it
            holds only a scoped, expiring key — and every swap answers the riddle first.
          </Reveal>
          {/* The relationship, stated where the name is first used rather than left to
              a footer. Sphynx builds ON Robinhood's Agentic API and Robinhood Chain —
              that is a dependency, not an endorsement, and reading it as one would be
              the project's fault, not the reader's. */}
          <Reveal
            className="vx-sub vx-sub--hero"
            i={5}
            style={{ marginTop: "0.55em", maxWidth: "46ch", fontSize: "0.78em", opacity: 0.62 }}
          >
            An independent project that builds on Robinhood&rsquo;s Agentic API and
            Robinhood Chain. Not affiliated with, endorsed by, or reviewed by Robinhood.
          </Reveal>
          <Reveal className="vx-sub vx-sub--hero" i={6} style={{ marginTop: "0.7em", maxWidth: "46ch" }}>
            We publish our no&rsquo;s: the first number you&rsquo;ll see is how often the vault refused.
          </Reveal>
          <Reveal i={7} style={{ marginTop: "1.1em" }}>
            <RefusalCounter />
          </Reveal>
          <Reveal className="vx-cta-row" i={8}>
            <a className="vx-btn vx-btn-lime" href={REQUEST_ACCESS_URL}>
              <span>Connect wallet</span>
              <ArrowUpRight />
            </a>
            <a className="vx-btn vx-btn-glass" href="/refusals">
              <span>Read our no&rsquo;s</span>
            </a>
          </Reveal>
        </div>
        <div className="vx-cue" aria-hidden="true">
          <span>Scroll to enter</span>
          <span className="vx-cue__line" />
        </div>
      </section>

      {/* ── ONE DESK ── */}
      <section className="vx-sec vx-h-tall" id="vx-desk">
        <div className="vx-sec__inner">
          <IndexLabel n="01">The Gate</IndexLabel>
          <div className="vx-mark">
            <VMark />
          </div>
          <RevealChars text="The Gate" as="h2" className="vx-title" />
          <RevealLines
            className="vx-sub"
            lines={["Reads the tape.", "Guards the gate.", "Waits for you."]}
          />
          <RevealLines
            className="vx-desc"
            step={70}
            lines={[
              "Tokenized stocks made the market 24/7 and a swap one click. That is the",
              "hype — and the hole. SPHYNX is the gatekeeper on both doors: on the",
              "brokerage desk no order is ever placed without your explicit yes,",
              "unchanged and not changing; on Robinhood Chain the written caps are",
              "compiled into a vault that reverts any swap breaching them.",
            ]}
          />
        </div>
      </section>

      {/* ── EVERY ANGLE ── */}
      <section className="vx-sec vx-h-mid" id="vx-angles">
        <div className="vx-sec__inner">
          <IndexLabel n="02">The Riddle</IndexLabel>
          <RevealChars text="Every Swap Answers" as="h2" className="vx-title" />
          <RevealLines
            className="vx-desc"
            step={70}
            lines={[
              "Nothing passes the Sphinx without answering. Fundamental, technical and",
              "macro analysts each argue their read; a Risk Manager tests the trade",
              "against the written rules and holds veto over them all. Then you answer.",
              "The analysts physically hold no order tools — anyone can verify it in the repo.",
            ]}
          />
        </div>
      </section>

      {/* ── BUILT FOR ── */}
      <section className="vx-sec vx-h-tall" id="vx-built">
        <div className="vx-sec__inner">
          <IndexLabel n="03">The Key</IndexLabel>
          <RevealChars text="A Key That Expires" as="h2" className="vx-title vx-title--sm" />
          <div className="vx-trio">
            <Reveal className="vx-trio__item" i={1}>
              <span className="vx-trio__icon"><Diamond /></span>
              <h3>Scoped</h3>
              <p>The agent&rsquo;s on-chain key is boxed by expiry, per-trade and total budget, trade count and a ticker allowlist.</p>
            </Reveal>
            <Reveal className="vx-trio__item" i={2}>
              <span className="vx-trio__icon"><Diamond /></span>
              <h3>Revocable</h3>
              <p>Pull the key any time. On the desk, the kill switch is one command that severs all broker access.</p>
            </Reveal>
            <Reveal className="vx-trio__item" i={3}>
              <span className="vx-trio__icon"><Diamond /></span>
              <h3>Never yours</h3>
              <p>&ldquo;Autonomous&rdquo; and &ldquo;your money&rdquo; never share a sentence here. The whole balance is never in reach.</p>
            </Reveal>
          </div>
          <Reveal i={4} style={{ marginTop: "1.2em" }}>
            <KeyStatus />
          </Reveal>
        </div>
      </section>

      {/* ── SIGNALS (river chapter) ── */}
      <section className="vx-sec vx-h-mid" id="vx-signals">
        <div className="vx-sec__inner">
          <IndexLabel n="04">The Storm</IndexLabel>
          <RevealChars text="Hype Is Weather" as="h2" className="vx-title" />
          <RevealLines
            className="vx-desc"
            step={70}
            lines={[
              "24/7 markets mean 24/7 noise: threads, headlines, “buy now” pasted into",
              "a news feed. The desk treats everything it fetches as data, never as",
              "instructions — instruction-like text is quoted and flagged, not obeyed.",
            ]}
          />
        </div>
      </section>

      {/* ── YOU DECIDE ── */}
      <section className="vx-sec vx-h-mid" id="vx-decide">
        <div className="vx-sec__inner">
          <IndexLabel n="05">The No</IndexLabel>
          <RevealChars text="We Publish Our No’s" as="h2" className="vx-title" />
          <RevealLines
            className="vx-desc"
            step={70}
            lines={[
              "Everyone posts their wins. We post our refusals. previewTrade() names",
              "the exact rule a swap would break before anyone signs; a refused swap",
              "spends none of the session budget; and every refusal and veto goes on an",
              "append-only record. Refusals are the only metric honest at TVL zero.",
            ]}
          />
          <Reveal i={3} style={{ marginTop: "1.4em" }}>
            <RiddleCard />
          </Reveal>
          <Reveal i={4} style={{ marginTop: "1.2em" }}>
            <RefusalTicker />
          </Reveal>
        </div>
      </section>

      {/* ── EVERYTHING IN VIEW (lake chapter) ── */}
      <section className="vx-sec vx-h-view" id="vx-view">
        <div className="vx-sec__inner">
          <IndexLabel n="06">In Stone</IndexLabel>
          <RevealChars text="Rules Carved In Stone" as="h2" className="vx-title" />
          <RevealLines
            className="vx-desc"
            step={70}
            lines={[
              "The agent’s limits are published on-chain before it trades: read them,",
              "then watch every swap against them. An ERC-4626 vault holds the book on",
              "Robinhood Chain mainnet. No management fee, no performance fee, no carry.",
              "Stock tokens are price-tracking, not shares, and not for US persons.",
              "Mainnet · unaudited · no timelock on owner caps · deposits capped · nothing attested yet.",
            ]}
          />
          <Reveal i={3} style={{ marginTop: "1.3em" }}>
            <ContractStrip />
          </Reveal>
        </div>
      </section>

      {/* ── ACCESS / CTA ── */}
      <section className="vx-sec vx-h-last" id="vx-run">
        <div className="vx-sec__inner">
          <IndexLabel n="07">Access</IndexLabel>
          <RevealChars text="Access Is Open" as="h2" className="vx-title" step={26} />
          <RevealLines
            className="vx-desc"
            step={70}
            lines={[
              "Two doors, one Sphinx. The on-chain door is open: connect a wallet,",
              "deposit USDG, and every order answers the vault before it fills.",
              "Withdraw or redeem in kind at any time. The brokerage desk still",
              "stops at a preview. Mainnet · unaudited · no track record · not advice.",
            ]}
          />
          <Reveal className="vx-cta-row" i={2}>
            <a className="vx-btn vx-btn-lime" href={REQUEST_ACCESS_URL}>
              <span>Connect wallet</span>
              <ArrowUpRight />
            </a>
            <a className="vx-btn vx-btn-glass" href="/docs/risks">
              <span>Read the risks</span>
            </a>
          </Reveal>
        </div>
      </section>

      <footer className="vx-foot" id="vx-foot">
        <Reveal className="vx-kicker" i={0}>Every swap answers the riddle.</Reveal>
        <RevealChars text="Pass the Sphinx" as="h2" className="vx-title" step={22} />
        <Reveal className="vx-cta-row" i={2}>
          <a className="vx-btn vx-btn-lime" href={REQUEST_ACCESS_URL}><span>Connect wallet</span><ArrowUpRight /></a>
          <a className="vx-btn vx-btn-glass" href="/refusals"><span>Our no&rsquo;s</span></a>
          <a className="vx-btn vx-btn-glass" href="/docs"><span>Docs</span></a>
          <a className="vx-btn vx-btn-glass" href={VAULT_URL}><span>Vault</span></a>
        </Reveal>
        <p className="vx-foot__legal">
          <b>Not investment advice.</b> The Robinhood Chain vault
          is mainnet, unaudited, deposit-capped, has no timelock, no depositors, no trades
          and no track record. Sphynx is an independent project: it builds on Robinhood&rsquo;s
          Agentic API and on Robinhood Chain, and on Anthropic&rsquo;s Claude, but it is not
          affiliated with, endorsed by, or reviewed by Robinhood or Anthropic. &ldquo;Robinhood&rdquo;
          and &ldquo;Claude&rdquo; are their respective owners&rsquo; marks, used here only to name the
          platforms this project runs on.
        </p>
      </footer>
    </div>
  );
}
