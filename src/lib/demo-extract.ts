import { DealNotes, TranscriptLine } from "@/lib/types";

function findLine(
  transcript: TranscriptLine[],
  pattern: RegExp,
): TranscriptLine | undefined {
  return transcript.find((line) => pattern.test(line.text));
}

/**
 * Evidence sentinel for a claim whose pattern matched no transcript line.
 * The lineId never exists, so the gate demotes the claim instead of letting
 * it ride on an arbitrary fallback line's quote (right quote, wrong claim —
 * the same self-certification the recap mapper was cured of).
 */
const NO_EVIDENCE = { lineId: "__unsupported__", quote: "" };

function claimFrom(
  line: TranscriptLine | undefined,
  text: string,
): { text: string; evidence: { lineId: string; quote: string } } {
  if (!line) {
    return { text, evidence: { ...NO_EVIDENCE } };
  }
  const quote =
    line.text.length > 90 ? `${line.text.slice(0, 87)}...` : line.text;
  return {
    text,
    evidence: { lineId: line.id, quote },
  };
}

/** Deterministic offline extractor so demos work without a live key. */
export function demoExtractDealNotes(
  transcript: TranscriptLine[],
  titleHint: string,
): DealNotes {
  if (transcript.length === 0) {
    throw new Error("Cannot extract from empty transcript");
  }

  const first = transcript[0];
  const need = findLine(transcript, /need|want|looking|resetting|driving/i);
  const expensive = findLine(
    transcript,
    /expensive|pricing|budget|renewal|seat/i,
  );
  const accuracy = findLine(
    transcript,
    /accuracy|proof|receipt|citation|hallucin|SSO|DPA|PHI|dashboard|migration|legal/i,
  );
  const pilot = findLine(
    transcript,
    /pilot|bake-off|West|compliance|two weeks|procurement|start date/i,
  );
  const intent = findLine(
    transcript,
    /Intent is|intent is|decision|replace|cancel|standardize|Fireflies/i,
  );
  const next = findLine(
    transcript,
    /Next step|send|follow-up|I'll|schedule|comparison|side by side/i,
  );
  const today = findLine(
    transcript,
    /today|Thursday|Tuesday|end of day|Friday|next week/i,
  );

  return {
    title: titleHint,
    summary: [
      claimFrom(
        need,
        "Buyer is evaluating call intelligence because current notes lack trust or depth.",
      ),
      claimFrom(
        expensive,
        "Cost, seats, or renewal pressure is part of the buying conversation.",
      ),
      claimFrom(
        pilot,
        "They prefer a scoped pilot before a broader rollout.",
      ),
    ],
    objections: [
      claimFrom(
        accuracy || expensive,
        accuracy
          ? "Trust / proof / security constraints must be satisfied before expansion."
          : "Pricing or commercial structure is a live objection.",
      ),
    ],
    intent: [
      claimFrom(
        intent,
        intent?.text || "Buyer signaled a near-term vendor decision.",
      ),
    ],
    nextSteps: [
      claimFrom(
        next,
        "Owner committed to a concrete follow-up artifact or meeting.",
      ),
      claimFrom(
        today,
        "There is a dated checkpoint the buyer can share internally.",
      ),
    ],
    pain: accuracy
      ? [
          claimFrom(
            accuracy,
            "Trust, proof, or security constraints are the live pain.",
          ),
        ]
      : [],
    pricing: expensive
      ? [
          claimFrom(
            expensive,
            "Pricing, seats, or renewal cost is on the table.",
          ),
        ]
      : [],
    competitors: (() => {
      const named = findLine(
        transcript,
        /Fireflies|Gong|Chorus|Otter|Fathom|Clari/i,
      );
      return named
        ? [
            claimFrom(
              named,
              "An incumbent or competing tool was named on the call.",
            ),
          ]
        : [];
    })(),
    followUpEmail: {
      subject: `Next steps: ${titleHint}`,
      body: [
        "Thanks again for the conversation.",
        "",
        "As discussed, I'm attaching deal notes with receipts back to the transcript, plus the agreed next steps.",
        "",
        "Reply with anyone else who should be looped in before the next checkpoint.",
        "",
        "OpenGong Lite",
      ].join("\n"),
      evidence: {
        lineId: (next || transcript[transcript.length - 2] || first).id,
        quote: (next || transcript[transcript.length - 2] || first).text.slice(
          0,
          90,
        ),
      },
    },
  };
}
