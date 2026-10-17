/**
 * Ethiopian Traditional Time Converter.
 *
 * In Ethiopia, the 12-hour day cycle begins at dawn (6:00 AM Gregorian is 12:00 sunrise).
 * The 1st hour of daytime is 7:00 AM (ጠዋት 1:00).
 * The 1st hour of nighttime is 7:00 PM (ምሽት 1:00).
 * 9:00 PM (21:00) is 3:00 Night (ምሽት 3:00).
 * 10:00 PM (22:00) is 4:00 Night (ምሽት 4:00).
 */

export interface EthiopianTimeResult {
  ethHour: number;
  minute: number;
  minuteStr: string;
  periodAm: string;
  periodEn: string;
  formattedAm: string;
  formattedEn: string;
}

export function convertToEthiopianTime(hour24: number, minute: number): EthiopianTimeResult {
  const ethHour = ((hour24 - 6 + 12) % 12) || 12;
  const minuteStr = minute < 10 ? `0${minute}` : String(minute);

  let periodAm = 'ከጠዋቱ';
  let periodEn = 'Morning';

  if (hour24 >= 6 && hour24 < 12) {
    periodAm = 'ከጠዋቱ';
    periodEn = 'Morning';
  } else if (hour24 >= 12 && hour24 < 18) {
    periodAm = 'ከሰዓት';
    periodEn = 'Afternoon';
  } else if (hour24 >= 18 && hour24 < 24) {
    periodAm = 'ከምሽቱ';
    periodEn = 'Night';
  } else {
    periodAm = 'ከሌሊቱ';
    periodEn = 'Dawn';
  }

  return {
    ethHour,
    minute,
    minuteStr,
    periodAm,
    periodEn,
    formattedAm: `${periodAm} ${ethHour}:${minuteStr}`,
    formattedEn: `${ethHour}:${minuteStr} ${periodEn}`,
  };
}

/**
 * Format any ISO date/time string (e.g. "2026-10-21T13:00" or Date object) into Ethiopian time.
 */
export function formatEthiopianTime(
  dateOrStr: string | Date | null | undefined,
  lang: 'en' | 'am' = 'en'
): string {
  if (!dateOrStr) return '';
  const d = typeof dateOrStr === 'string' ? new Date(dateOrStr) : dateOrStr;
  if (isNaN(d.getTime())) return '';

  const res = convertToEthiopianTime(d.getHours(), d.getMinutes());
  return lang === 'am' ? res.formattedAm : res.formattedEn;
}
