import { DealNotes, TranscriptLine } from "@/lib/types";

function findLine(
  transcript: TranscriptLine[],
  pattern: RegExp,
): TranscriptLine | undefined {
  return transcript.find((line) => pattern.test(line.text));
}

function claimFrom(
  line: TranscriptLine | undefined,
  text: string,
  fallback: TranscriptLine,
): { text: string; evidence: { lineId: string; quote: string } } {
  const target = line || fallback;
  const quote =
    target.text.length > 90 ? `${target.text.slice(0, 87)}...` : target.text;
  return {
    text,
    evidence: { lineId: target.id, quote },
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
        first,
      ),
      claimFrom(
        expensive,
        "Cost, seats, or renewal pressure is part of the buying conversation.",
        transcript[1] || first,
      ),
      claimFrom(
        pilot,
        "They prefer a scoped pilot before a broader rollout.",
        transcript[Math.min(5, transcript.length - 1)],
      ),
    ],
    objections: [
      claimFrom(
        accuracy || expensive,
        accuracy
          ? "Trust / proof / security constraints must be satisfied before expansion."
          : "Pricing or commercial structure is a live objection.",
        transcript[Math.min(3, transcript.length - 1)],
      ),
    ],
    intent: [
      claimFrom(
        intent,
        intent?.text || "Buyer signaled a near-term vendor decision.",
        transcript[transcript.length - 1],
      ),
    ],
    nextSteps: [
      claimFrom(
        next,
        "Owner committed to a concrete follow-up artifact or meeting.",
        transcript[Math.min(6, transcript.length - 1)],
      ),
      claimFrom(
        today,
        "There is a dated checkpoint the buyer can share internally.",
        transcript[Math.min(8, transcript.length - 1)],
      ),
    ],
    pain: accuracy
      ? [
          claimFrom(
            accuracy,
            "Trust, proof, or security constraints are the live pain.",
            accuracy,
          ),
        ]
      : [],
    pricing: expensive
      ? [
          claimFrom(
            expensive,
            "Pricing, seats, or renewal cost is on the table.",
            expensive,
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
              named,
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
        "— OpenGong Lite",
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
