import { BorderScan } from "@/components/ui/border-scan";
import { Reveal } from "@/components/ui/reveal";
import { SquaresBg } from "@/components/ui/squares-bg";
import { STEPS } from "@/lib/data";

export function HowItWorks() {
  return (
    <section className="sec dark" id="flow">
      <SquaresBg tone="lime" />
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">// 02, HOW IT WORKS</span>
            <h2>
              Sense → research →<br />the riddle → you answer.
            </h2>
          </div>
          <p>
            Steps 1–6 are research and produce no order. Every trade must answer twice — the Risk
            Manager at step&nbsp;5, you at step&nbsp;7 — and the desk stops at the preview card until you say go.
          </p>
        </div>
        <div className="flow">
          {STEPS.map((s, i) => {
            const isYou = "you" in s && s.you;
            return (
              <Reveal key={s.num} delay={i * 60} className={"step" + (isYou ? " you" : "")}>
                {isYou && <BorderScan color="#E2664A" size={10} speed={90} />}
                <div className="num">{s.num}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
