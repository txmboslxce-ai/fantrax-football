interface AvailabilityIconProps {
  chanceOfPlaying: number | null;
  status: string | null;
  news: string | null;
}

type AvailabilityDisplay = {
  label: string;
  className: string;
  fallbackTitle: string;
};

function getDisplay(chanceOfPlaying: number | null, status: string | null): AvailabilityDisplay | null {
  if (chanceOfPlaying == null || chanceOfPlaying === 100) {
    return null;
  }

  if (chanceOfPlaying === 75) {
    return {
      label: "D",
      className: "border-amber-300/35 bg-amber-500/20 text-amber-100",
      fallbackTitle: "Doubtful (75%)",
    };
  }

  if (chanceOfPlaying === 50) {
    return {
      label: "D",
      className: "border-amber-300/35 bg-amber-500/30 text-amber-100",
      fallbackTitle: "Doubtful (50%)",
    };
  }

  if (chanceOfPlaying === 25) {
    return {
      label: "D",
      className: "border-orange-300/35 bg-orange-500/30 text-orange-100",
      fallbackTitle: "Doubtful (25%)",
    };
  }

  if (chanceOfPlaying === 0) {
    if (status === "i") {
      return {
        label: "i",
        className: "border-red-300/35 bg-red-500/30 text-red-100",
        fallbackTitle: "Injured",
      };
    }

    if (status === "s") {
      return {
        label: "S",
        className: "border-red-300/35 bg-red-500/30 text-red-100",
        fallbackTitle: "Suspended",
      };
    }

    if (status === "u") {
      return {
        label: "OUT",
        className: "border-red-300/35 bg-red-500/30 text-red-100",
        fallbackTitle: "Unavailable",
      };
    }
  }

  return null;
}

export default function AvailabilityIcon({ chanceOfPlaying, status, news }: AvailabilityIconProps) {
  const display = getDisplay(chanceOfPlaying, status);
  if (!display) {
    return null;
  }

  const title = news && news.trim() ? news.trim() : display.fallbackTitle;

  return (
    <span
      title={title}
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold leading-none ${display.className}`}
      aria-label={title}
    >
      {display.label}
    </span>
  );
}
