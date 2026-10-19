import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CheckCircle2, GraduationCap, Share2 } from "lucide-react";
import { SaveStatusBanner } from "../shared/UI";
import { trainingApi } from "../../lib/training/api";
import { isoDay, refreshLabel, shuffled } from "../../lib/training/status";
import { fmtDate } from "../../lib/helpers";

/** Floor-plan tabs for the fire briefing. The briefing HTML from the server marks the spot with
    <div data-training-plans>, which is filled in with this component through a portal. */
function PlanViewer({ plans }) {
  const [i, setI] = useState(0);
  if (!plans.length) return null;
  const plan = plans[Math.min(i, plans.length - 1)];
  return (
    <div className="tr-plans">
      <div className="tr-plan-tabs" role="tablist" aria-label="Floor">
        {plans.map((p, k) => (
          <button key={p.file} type="button" role="tab" aria-selected={k === i} className={"chip" + (k === i ? " chip--active" : "")} onClick={() => setI(k)}>{p.label}</button>
        ))}
      </div>
      <figure className="tr-plan-img" style={{ margin: 0 }}>
        <img src={trainingApi.planUrl(plan.file)} alt={`Floor plan: ${plan.label}`} />
        {plan.note && <figcaption className="muted" style={{ marginTop: 6 }}>{plan.note}</figcaption>}
      </figure>
    </div>
  );
}

export function ModuleView({ module, plans, result, onBack, onStart, onAcknowledge, ackBusy, ackError }) {
  const html = useMemo(() => ({ __html: module.briefing }), [module.briefing]);
  const ref = useRef(null);
  const [slot, setSlot] = useState(null);
  useEffect(() => {
    setSlot(ref.current?.querySelector("[data-training-plans]") || null);
    // Photos in a briefing are <img data-training-image="name.jpg">: point each at the server (sign-in required) once the briefing is on screen.
    ref.current?.querySelectorAll("img[data-training-image]").forEach((img) => { img.src = trainingApi.imageUrl(img.dataset.trainingImage); });
  }, [module.id]);
  return (
    <div className="module-view">
      <button className="btn btn-ghost" style={{ padding: "4px 0", marginBottom: 10 }} onClick={onBack}><ArrowLeft size={15} /> Back to modules</button>
      <div className="module-header">
        <div className="module-title"><GraduationCap size={22} color="#197386" /><h2>{module.title}</h2></div>
      </div>
      <p className="muted" style={{ marginBottom: 14 }}>
        {module.kind === "info"
          ? <>About {module.minutes || 10} minutes · information only, no quiz{module.refreshMonths ? <> · read again {refreshLabel(module.refreshMonths)}</> : null}</>
          : <>About {module.minutes || 10} minutes · repeat {refreshLabel(module.refreshMonths)} · version {module.version}</>}
      </p>
      <div className="tr-brief" ref={ref} dangerouslySetInnerHTML={html} />
      {slot && createPortal(<PlanViewer plans={plans} />, slot)}
      {module.kind === "info" ? (
        <>
          <div className="tr-actions">
            {result?.passed && !(result.validUntil && new Date(result.validUntil) < new Date())
              ? <span className="muted"><CheckCircle2 size={15} style={{ verticalAlign: -3 }} color="#3B8268" /> You marked this as read on {fmtDate(isoDay(result.completedAt))}.</span>
              : <button className="btn btn-primary" onClick={onAcknowledge} disabled={ackBusy}>{ackBusy ? "Saving…" : "I've read and understood this"}</button>}
          </div>
          {ackError && <div className="tr-error" role="alert">{ackError}</div>}
        </>
      ) : (
        <>
          <div className="tr-actions">
            <button className="btn btn-primary" onClick={onStart}>Start assessment ({module.questionCount} questions)</button>
            <span className="muted">Pass mark: {module.passMarkCount} of {module.questionCount} correct.</span>
          </div>
          {module.certNote && <p className="muted">{module.certNote}</p>}
        </>
      )}
    </div>
  );
}

/** One question at a time. Questions and options are shuffled once per attempt; the answer sent to the
    server is the TEXT of the chosen option, so shuffling never matters to marking. */
export function Quiz({ module, onCancel, onDone }) {
  const questions = useMemo(() => shuffled(module.questions).map((q) => ({ stem: q.stem, options: shuffled(q.options) })), [module.id]);
  const [answers, setAnswers] = useState({});
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);
  const q = questions[idx];
  const answered = Object.keys(answers).length;
  const last = idx === questions.length - 1;

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const result = await trainingApi.attempt({
        moduleId: module.id, moduleVersion: module.version,
        answers: questions.map((x) => ({ question: x.stem, chosen: answers[x.stem] ?? null })),
      });
      onDone(result);
    } catch (e) {
      if (e.status === 409) setStale(true);
      setError(e.status ? e.message : "Couldn't reach the server. Your answers are still here: try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="module-view tr-quiz">
      <div className="module-header" style={{ marginBottom: 4 }}>
        <div className="module-title"><GraduationCap size={22} color="#197386" /><h2>{module.title}</h2></div>
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Leave assessment</button>
      </div>
      <p className="muted">Question {idx + 1} of {questions.length}</p>
      <div className="tr-qbar" aria-hidden="true"><i style={{ width: `${(answered / questions.length) * 100}%` }} /></div>
      <div className="tr-qcard">
        <p className="tr-stem">{q.stem}</p>
        <div className="tr-opts" role="group" aria-label="Answer options">
          {q.options.map((o, k) => (
            <button key={o} type="button" className="tr-opt" aria-pressed={answers[q.stem] === o} onClick={() => setAnswers((a) => ({ ...a, [q.stem]: o }))}>
              <b>{String.fromCharCode(65 + k)}</b><span>{o}</span>
            </button>
          ))}
        </div>
      </div>
      {error && <div className="tr-error" role="alert">{error}{stale && <> <button className="btn btn-ghost" style={{ padding: 0 }} onClick={onCancel}>Back to the module</button></>}</div>}
      <div className="tr-actions" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0 || busy}>Previous</button>
        {last
          ? <button className="btn btn-primary" onClick={submit} disabled={busy || answered < questions.length}>{busy ? "Marking…" : error && !stale ? "Try again" : "Submit answers"}</button>
          : <button className="btn btn-primary" onClick={() => setIdx((i) => i + 1)} disabled={!answers[q.stem]}>Next</button>}
      </div>
      {last && answered < questions.length && <p className="muted">Answer every question to submit. Use Previous to go back to any you skipped.</p>}
    </div>
  );
}

export function ResultView({ module, result, onBack, onRetake, onSaveCertificate, saveStatus, saveBusy, saveError }) {
  const percent = Math.round((result.score / result.total) * 100);
  return (
    <div className="module-view tr-quiz">
      <button className="btn btn-ghost" style={{ padding: "4px 0", marginBottom: 10 }} onClick={onBack}><ArrowLeft size={15} /> Back to modules</button>
      <div className="module-header"><div className="module-title"><GraduationCap size={22} color="#197386" /><h2>{result.moduleTitle}</h2></div></div>
      <div className={"tr-score " + (result.passed ? "pass" : "fail")}>
        <div className="tr-big">{result.score}/{result.total}</div>
        <div>
          <strong>{result.passed ? "Passed" : "Not passed"}</strong> ({percent}%)
          <dl>
            <dt>Pass mark</dt><dd>{result.passMarkCount} of {result.total}</dd>
            {result.passed && <><dt>Valid until</dt><dd>{fmtDate(isoDay(result.validUntil))}</dd><dt>Certificate</dt><dd>{result.certificateNo}</dd></>}
          </dl>
        </div>
      </div>
      <div className="tr-actions" style={{ marginTop: 0 }}>
        {result.passed && <button className="btn btn-primary" onClick={() => onSaveCertificate(result.certificateNo)} disabled={saveBusy}><Share2 size={15} /> {saveBusy ? "Preparing…" : "Save certificate"}</button>}
        {!result.passed && <button className="btn btn-primary" onClick={onRetake}>Read the briefing and try again</button>}
        <button className="btn btn-ghost" onClick={onBack}>Back to modules</button>
      </div>
      <SaveStatusBanner status={saveStatus} />
      {saveError && <div className="tr-error" role="alert">{saveError}</div>}
      <h3 style={{ margin: "6px 0 10px" }}>Your answers</h3>
      <ol className="tr-review">
        {result.review.map((r) => (
          <li key={r.question} className={r.isCorrect ? "" : "x"}>
            <span className="q">{r.question}</span>
            {r.isCorrect
              ? <span><CheckCircle2 size={14} style={{ verticalAlign: -2 }} color="#3B8268" /> {r.chosen}</span>
              : <>
                  <span>Your answer: {r.chosen ? <s>{r.chosen}</s> : <em>no answer</em>}</span>
                  <span>Correct answer: <strong>{r.correct}</strong></span>
                </>}
            {r.explanation && <span className="why">{r.explanation}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
