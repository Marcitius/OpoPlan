import { Temporal } from "@js-temporal/polyfill";
export function dayAt(
  instant: string | number | Date = new Date(),
  timezone = "Europe/Madrid",
): string {
  return Temporal.Instant.from(
    typeof instant === "number"
      ? new Date(instant).toISOString()
      : instant instanceof Date
        ? instant.toISOString()
        : instant,
  )
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
}
export const addDays = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();
export const daysBetween = (a: string, b: string) =>
  Temporal.PlainDate.from(a).until(Temporal.PlainDate.from(b), {
    largestUnit: "days",
  }).days;
export function fromLocal(value: string, timezone: string): string {
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime(timezone, { disambiguation: "compatible" })
    .toInstant()
    .toString();
}
export function localInput(instant: string, timezone: string): string {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(timezone)
    .toPlainDateTime()
    .toString()
    .slice(0, 16);
}
export const labelDay = (
  day: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) =>
  new Intl.DateTimeFormat("es-ES", { ...options, timeZone: "UTC" }).format(
    new Date(day + "T12:00:00Z"),
  );
export const minutesLabel = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return seconds > 0 && !minutes
    ? "<1 min"
    : minutes >= 60
      ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
      : `${minutes} min`;
};

export const addMonths = (date: string, months: number) =>
  Temporal.PlainDate.from(date).add({ months }).toString();
export const monthGridStart = (date: string) => {
  const first = Temporal.PlainDate.from(date).with({ day: 1 });
  return first.subtract({ days: first.dayOfWeek - 1 }).toString();
};
