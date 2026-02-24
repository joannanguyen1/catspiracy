import React from "react";

export default function CatIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={64}
      height={64}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="32" cy="36" r="14" stroke="currentColor" strokeWidth="2" fill="white" />
      <path d="M26 20 L32 14 L38 20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="27" cy="34" r="2" fill="currentColor" />
      <circle cx="37" cy="34" r="2" fill="currentColor" />
      <path d="M32 40 Q34 44 32 46 Q30 44 32 40" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
