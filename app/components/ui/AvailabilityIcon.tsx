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
      className: "border-amber-300 bg-amber-50 text-amber-900",
      fallbackTitle: "Doubtful (75%)",
    };
  }

  if (chanceOfPlaying === 50) {
    return {
      label: "D",
      className: "border-amber-300 bg-amber-100 text-amber-900",
      fallbackTitle: "Doubtful (50%)",
    };
  }

  if (chanceOfPlaying === 25) {
    return {
      label: "D",
      className: "border-orange-300 bg-orange-100 text-orange-900",
      fallbackTitle: "Doubtful (25%)",
    };
  }

  if (chanceOfPlaying === 0) {
    if (status === "i") {
      return {
        label: "i",
        className: "border-red-300 bg-red-50 text-red-900",
        fallbackTitle: "Injured",
      };
    }

    if (status === "s") {
      return {
        label: "S",
        className: "border-red-300 bg-red-50 text-red-900",
        fallbackTitle: "Suspended",
      };
    }

    if (status === "u") {
      return {
        label: "OUT",
        className: "border-red-300 bg-red-50 text-red-900",
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
      className={`inline-flex rounded-full border px-1 py-px text-[10px] font-bold leading-none ${display.className}`}
      aria-label={title}
    >
      {display.label}
    </span>
  );
}
