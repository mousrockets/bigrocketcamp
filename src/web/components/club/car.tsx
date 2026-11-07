import { cn } from 'cn';

// The club's car, crossing the celebration with its boost; it stops and blows up when the debt is cleared.

function CarShape() {
  return (
    <svg
      viewBox="0 0 160 60"
      aria-hidden="true"
      className="w-[110px] drop-shadow-[0_6px_8px_rgb(0_0_0/0.4)] lg:w-[150px]"
    >
      <path d="M3 21h20v3L8 27z" fill="#1d2f4d" />
      <path
        d="M6 44 10 30q2-4 8-5l38-4L78 9q4-2 10-2l26 1q6 1 10 6l12 10 14 3q6 2 6 8v9z"
        fill="#3d8bff"
        stroke="#0b1430"
        strokeWidth="2"
      />
      <path d="M62 21 80 11h32l14 11z" fill="#0b1430" />
      <path d="M12 34h140v4H10z" fill="#f4f5f7" />
      {[38, 128].map((cx) => (
        <g
          key={cx}
          className="[animation:brc-spin_.6s_linear_infinite] [transform-box:fill-box] [transform-origin:center]"
        >
          <circle cx={cx} cy="45" r="12" fill="#111114" stroke="#4a4c52" strokeWidth="2" />
          <circle cx={cx} cy="45" r="5" fill="#c9cbd1" />
          <path d={`M${cx - 9} 45h18M${cx} 36v18`} stroke="#c9cbd1" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}

export function CarRun({ stop }: { stop: boolean }) {
  return (
    <div aria-hidden="true" className="motion-only pointer-events-none fixed inset-x-0 top-[52%] z-[55]">
      <div
        className={cn(
          'flex items-center',
          stop
            ? '[animation:brc-drive-stop_.85s_cubic-bezier(.4,0,.7,1)_forwards,brc-vanish_.01s_.85s_forwards]'
            : '[animation:brc-drive_1.4s_cubic-bezier(.45,0,.25,1)_forwards]',
        )}
        style={{ transform: 'translateX(-260px)' }}
      >
        <span className="mt-1.5 -mr-2.5 h-[18px] w-20 origin-right rounded-xl bg-[linear-gradient(90deg,transparent,#3d8bff_40%,#a9d1ff_75%,#fff)] blur-[1.5px] [animation:brc-flicker_.07s_linear_infinite_alternate] lg:w-[120px]" />
        <CarShape />
      </div>
      {stop && (
        <div className="absolute top-[22px] left-1/2 size-0">
          <b className="absolute -top-10 -left-10 size-20 rounded-full border-8 border-[#3d8bff] opacity-0 [animation:brc-ring_.7s_.85s_ease-out_forwards]" />
          <b className="absolute -top-10 -left-10 size-20 rounded-full border-8 border-[#f4f5f7] opacity-0 [animation:brc-ring_.7s_.92s_ease-out_forwards]" />
          <b className="absolute -top-10 -left-10 size-20 rounded-full bg-[radial-gradient(circle,#fff,#3d8bff_45%,transparent_70%)] opacity-0 [animation:brc-blast_.5s_.85s_ease-out_forwards]" />
        </div>
      )}
    </div>
  );
}
