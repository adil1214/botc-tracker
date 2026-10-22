// Pure, DOM-free logic for interpreting botc.app's live Vuex state.
// All functions here are unit-tested (tests/model.test.js) against fixtures
// captured from a real botc.app v3.57.3 game.

/**
 * Convert botc.app's integer `game.phase` into a day/night label.
 * phase 0 = setup; odd = Night N; even = Day N (matches the official app's own math).
 * @param {number} phase
 * @returns {{phase:number, dayNumber:number, isDay:boolean, label:string}}
 */
export function phaseToDay(phase) {
  const p = Number(phase) || 0;
  if (p <= 0) return { phase: p, dayNumber: 1, isDay: false, label: 'Setup' };
  const dayNumber = Math.floor((p - 1) / 2) + 1;
  const isDay = p % 2 === 0;
  return { phase: p, dayNumber, isDay, label: `${isDay ? 'Day' : 'Night'} ${dayNumber}` };
}

/**
 * Normalize `vote.nomination` into [nominatorSeat, nomineeSeat] or null.
 * botc.app stores it as an array wrapped in a Vue reactive proxy, which can
 * read back as an array OR an array-like object ({0:a,1:b}) — handle both.
 * @param {any} nom
 * @returns {[number, number] | null}
 */
export function normalizeNomination(nom) {
  if (!nom || typeof nom !== 'object') return null;
  const a = nom[0];
  const b = nom[1];
  if (typeof a === 'number' && typeof b === 'number') return [a, b];
  return null;
}

/**
 * Seat indices that voted "yes" in a live/finished vote.
 * `votes[i]`: 1 = hand raised (voted), 0 = hand down, null = dead / cannot vote.
 * @param {Array<number|null>} votes
 * @returns {number[]} seat indices with value === 1
 */
export function votersFromVotes(votes) {
  if (!Array.isArray(votes)) return [];
  const out = [];
  for (let i = 0; i < votes.length; i++) {
    if (votes[i] === 1) out.push(i);
  }
  return out;
}

/**
 * Turn a tracked nomination into a finalized, serializable record.
 * @param {{nominatorSeat:number, nomineeSeat:number, type?:string, dayNumber?:number,
 *          votes?:Array, startedAt?:number}} rec
 * @returns {object}
 */
export function finalizeNomination(rec) {
  const voterSeats = votersFromVotes(rec.votes);
  return {
    nominatorSeat: rec.nominatorSeat,
    nomineeSeat: rec.nomineeSeat,
    type: rec.type || 'regular',
    dayNumber: rec.dayNumber ?? null,
    voterSeats,
    votesFor: voterSeats.length,
    startedAt: rec.startedAt ?? null,
    endedAt: Date.now(),
  };
}

/**
 * Group chat.userChannels entries ([userId, channelId][]) into conversations.
 * Users sharing the same non-empty channel are in a private chat together.
 * @param {Array<[string, string]>} entries  from Array.from(map.entries())
 * @returns {Array<{channel:string, members:string[]}>} sorted, non-empty channels only
 */
export function groupUserChannels(entries) {
  const byChannel = new Map();
  for (const [userId, channel] of entries || []) {
    if (!channel) continue; // "" / falsy == public, not a private chat
    if (!byChannel.has(channel)) byChannel.set(channel, []);
    byChannel.get(channel).push(String(userId));
  }
  const groups = [];
  for (const [channel, members] of byChannel.entries()) {
    members.sort();
    groups.push({ channel, members });
  }
  groups.sort((x, y) => x.channel.localeCompare(y.channel));
  return groups;
}

/** Stable key for an unordered pair of ids. */
export function pairKey(a, b) {
  return [String(a), String(b)].sort().join('|');
}

/**
 * All unordered member pairs across conversation groups (size >= 2).
 * @param {Array<{members:string[]}>} groups
 * @returns {string[]} unique pair keys
 */
export function pairsFromGroups(groups) {
  const set = new Set();
  for (const g of groups || []) {
    const m = g.members || [];
    if (m.length < 2) continue;
    for (let i = 0; i < m.length; i++) {
      for (let j = i + 1; j < m.length; j++) {
        set.add(pairKey(m[i], m[j]));
      }
    }
  }
  return [...set];
}
