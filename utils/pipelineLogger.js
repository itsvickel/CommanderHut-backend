/**
 * Structured JSON logging for AI pipeline runs. One line per run with stage
 * timings and validation outcomes, so prompt/model changes can be measured
 * (e.g. "did commander retries drop after the prompt edit?").
 */
export function createRunLogger(event, { userId } = {}) {
  const startedAt = Date.now();
  const stages = {};
  const facts = {};
  let lastMark = startedAt;

  return {
    /** Records elapsed ms since the previous mark under `stage`. */
    mark(stage) {
      const now = Date.now();
      stages[stage] = now - lastMark;
      lastMark = now;
    },
    /** Attaches arbitrary run facts (counts, model, retries). */
    set(key, value) {
      facts[key] = value;
    },
    finish(outcome, extra = {}) {
      const line = {
        event,
        outcome,
        user_id: userId ?? null,
        duration_ms: Date.now() - startedAt,
        stages,
        ...facts,
        ...extra,
      };
      // Single-line JSON so log aggregators can parse it.
      console.log(JSON.stringify(line));
      return line;
    },
  };
}
