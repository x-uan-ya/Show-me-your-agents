import type { CSSProperties } from "react";

const CLIENT_ACTIVITY_COLORS = ["#ff4b4b", "#00ff85", "#ff4b4b", "#55ff9b", "#ff4b4b", "#22ff77"];

export function clientActivityColor(index: number): string {
  return CLIENT_ACTIVITY_COLORS[index % CLIENT_ACTIVITY_COLORS.length];
}

export function clientActivityColorStyle(index: number): CSSProperties {
  const color = clientActivityColor(index);
  const isRed = index % 2 === 0;
  return {
    backgroundColor: color,
    boxShadow: isRed
      ? `0 0 13px 2px ${color}66`
      : `0 0 0 3px ${color}38, 0 0 18px 4px ${color}d9`,
  };
}

export const CAMPAIGN_CALENDAR_UPDATED_EVENT = "campaign-calendar-updated";
