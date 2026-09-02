/**
 * What a participant is doing right now, as a small icon + label:
 *  - picking: still choosing dishes (animated: food dropping into a basket)
 *  - ready:   tapped "Выбор сделан" (static tick)
 *  - paid:    marked the transfer (static money flying off)
 */

export type ParticipantState = "picking" | "ready" | "paid";

const LABEL: Record<ParticipantState, string> = {
  picking: "выбирает",
  ready: "выбрал",
  paid: "перевёл",
};

const TONE: Record<ParticipantState, string> = {
  picking: "text-muted-foreground",
  ready: "text-blue-600 dark:text-blue-500",
  paid: "text-green-600 dark:text-green-500",
};

function PickingIcon() {
  // A figure tossing food into a basket; the food loops, the figure bobs.
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <g className="picker-figure">
          <circle cx="7" cy="5.5" r="2.2" fill="currentColor" stroke="none" />
          <path d="M7 8v5.5" />
          <path d="M7 10.5l3.6-1.8" className="picker-arm" />
          <path d="M5.4 19l1.6-5.5 1.6 5.5" />
        </g>
        {/* food falling into the basket */}
        <circle cx="15.5" cy="8" r="1.5" fill="currentColor" stroke="none" className="picker-food" />
        {/* basket */}
        <path d="M12.5 14h8l-1 5.5h-6z" />
        <path d="M12.5 14h8" />
      </g>
    </svg>
  );
}

function ReadyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.15" />
      <path
        d="M7.5 12.5l3 3 6-6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaidIcon() {
  // A banknote with motion lines — the money has left the building
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="9" y="7.5" width="12" height="8" rx="1.5" />
        <circle cx="15" cy="11.5" r="2" />
        <path d="M6 9.5H2.5M6.5 13H4M7 16.5H5" />
      </g>
    </svg>
  );
}

export default function ParticipantStatus({
  state,
}: {
  state: ParticipantState;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${TONE[state]}`}
      title={LABEL[state]}
    >
      {state === "picking" && <PickingIcon />}
      {state === "ready" && <ReadyIcon />}
      {state === "paid" && <PaidIcon />}
      {LABEL[state]}
    </span>
  );
}
