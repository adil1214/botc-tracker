import { describe, it, expect } from 'vitest';
import {
  phaseToDay,
  normalizeNomination,
  votersFromVotes,
  finalizeNomination,
  groupUserChannels,
  pairsFromGroups,
  pairKey,
  uniqueVotersByDay,
  normalizeCallersByDay,
} from '../src/lib/model.js';

describe('normalizeCallersByDay', () => {
  it('migrates the old { channel, members } group shape to id arrays', () => {
    const old = { 1: { groups: [{ channel: 'c1', members: ['a', 'b'] }], pairs: ['a|b'] } };
    expect(normalizeCallersByDay(old)).toEqual({ 1: { groups: [['a', 'b']], pairs: ['a|b'] } });
  });

  it('passes through the current string[][] shape unchanged', () => {
    const cur = { 2: { groups: [['x', 'y']], pairs: ['x|y'] } };
    expect(normalizeCallersByDay(cur)).toEqual(cur);
  });

  it('is defensive about missing/malformed input', () => {
    expect(normalizeCallersByDay(null)).toEqual({});
    expect(normalizeCallersByDay({ 3: {} })).toEqual({ 3: { groups: [], pairs: [] } });
    expect(normalizeCallersByDay({ 4: { groups: [null, 5, 'z'] } }))
      .toEqual({ 4: { groups: [], pairs: [] } });
  });
});

describe('phaseToDay', () => {
  it('labels setup, nights and days like the official app', () => {
    expect(phaseToDay(0).label).toBe('Setup');
    expect(phaseToDay(1)).toMatchObject({ dayNumber: 1, isDay: false, label: 'Night 1' });
    expect(phaseToDay(2)).toMatchObject({ dayNumber: 1, isDay: true, label: 'Day 1' });
    expect(phaseToDay(4)).toMatchObject({ dayNumber: 2, isDay: true, label: 'Day 2' });
    expect(phaseToDay(6)).toMatchObject({ dayNumber: 3, isDay: true, label: 'Day 3' });
  });
});

describe('normalizeNomination', () => {
  it('reads real arrays', () => {
    expect(normalizeNomination([8, 7])).toEqual([8, 7]);
  });
  it('reads array-like proxies ({0,1})', () => {
    expect(normalizeNomination({ 0: 8, 1: 7 })).toEqual([8, 7]);
  });
  it('rejects a cleared nomination', () => {
    expect(normalizeNomination(false)).toBeNull();
    expect(normalizeNomination(null)).toBeNull();
    expect(normalizeNomination({})).toBeNull();
  });
});

describe('votersFromVotes + finalizeNomination (captured live fixture)', () => {
  // Real data captured from botc.app v3.57.3: seat 8 nominated seat 7.
  const votes = [1, 1, 1, 1, 0, 1, 0, null, 1, 0, 0, 1, 1, 1, 0];

  it('counts only hands that are up (===1), ignoring 0 and null', () => {
    expect(votersFromVotes(votes)).toEqual([0, 1, 2, 3, 5, 8, 11, 12, 13]);
  });

  it('finalizes nominator/nominee/voters correctly', () => {
    const rec = finalizeNomination({
      nominatorSeat: 8,
      nomineeSeat: 7,
      type: 'regular',
      dayNumber: 3,
      votes,
      startedAt: 1000,
    });
    expect(rec.nominatorSeat).toBe(8);
    expect(rec.nomineeSeat).toBe(7);
    expect(rec.votesFor).toBe(9);
    expect(rec.voterSeats).toEqual([0, 1, 2, 3, 5, 8, 11, 12, 13]);
    expect(rec.dayNumber).toBe(3);
  });
});

describe('uniqueVotersByDay', () => {
  const seatIds = ['a', 'b', 'c', 'd'];
  const nominations = [
    { dayNumber: 1, seatIds, voterSeats: [0, 2] }, // a, c
    { dayNumber: 1, seatIds, voterSeats: [2, 3] }, // c (dup), d
    { dayNumber: 2, seatIds, voterSeats: [1] }, // b
  ];

  it('unions each day’s voters by id and lists them in seat order', () => {
    const byDay = uniqueVotersByDay(nominations);
    expect(byDay.get(1)).toEqual([
      { id: 'a', seat: 0 },
      { id: 'c', seat: 2 },
      { id: 'd', seat: 3 },
    ]);
    expect(byDay.get(2)).toEqual([{ id: 'b', seat: 1 }]);
  });

  it('counts a player once even across several nominations the same day', () => {
    expect(uniqueVotersByDay(nominations).get(1)).toHaveLength(3);
  });

  it('falls back to the seat when no id was captured for it', () => {
    const byDay = uniqueVotersByDay([{ dayNumber: 1, seatIds: ['a'], voterSeats: [0, 5] }]);
    expect(byDay.get(1)).toEqual([
      { id: 'a', seat: 0 },
      { id: null, seat: 5 },
    ]);
  });

  it('is empty for no nominations', () => {
    expect(uniqueVotersByDay([]).size).toBe(0);
  });
});

describe('groupUserChannels + pairsFromGroups', () => {
  const entries = [
    ['u1', 'chanA'],
    ['u2', 'chanA'],
    ['u3', ''], // public -> excluded
    ['u6', 'chanB'],
    ['u5', 'chanB'],
    ['u4', 'chanB'],
  ];

  it('groups by shared non-empty channel, members sorted', () => {
    expect(groupUserChannels(entries)).toEqual([
      { channel: 'chanA', members: ['u1', 'u2'] },
      { channel: 'chanB', members: ['u4', 'u5', 'u6'] },
    ]);
  });

  it('derives all unordered pairs from conversations', () => {
    const pairs = pairsFromGroups(groupUserChannels(entries));
    expect(new Set(pairs)).toEqual(
      new Set([pairKey('u1', 'u2'), pairKey('u4', 'u5'), pairKey('u4', 'u6'), pairKey('u5', 'u6')]),
    );
  });

  it('ignores a lone occupant (no pair)', () => {
    expect(pairsFromGroups([{ channel: 'x', members: ['solo'] }])).toEqual([]);
  });
});
