// t=0 in mapState is defined as the J2000 epoch (2000-01-01 12:00 UTC,
// JD 2451545.0) - see keplerElementsFromEpoch in orbits.js. These two
// functions are the only bridge between real calendar dates and the
// simulation's plain elapsed-years time value.
const J2000_JD = 2451545.0;
const UNIX_EPOCH_JD = 2440587.5;
const MS_PER_DAY = 86400000;

export function dateToSimTime(date) {
  const jd = (date.getTime() / MS_PER_DAY) + UNIX_EPOCH_JD;
  return (jd - J2000_JD) / 365.25;
}

export function simTimeToDate(t) {
  const jd = J2000_JD + t * 365.25;
  const ms = (jd - UNIX_EPOCH_JD) * MS_PER_DAY;
  return new Date(ms);
}
