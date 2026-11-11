export function calendarSeason(date, window) {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  const [sm, sd] = window.start;
  const [em, ed] = window.end;
  return md >= sm * 100 + sd && md <= em * 100 + ed ? "christmas" : "normal";
}

export function resolveSeason(choice, date, window) {
  return choice === "auto" ? calendarSeason(date, window) : choice;
}
