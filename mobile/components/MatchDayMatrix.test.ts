import {
  MATRIX_DAY_WIDTH,
  MATRIX_FIXED_WIDTH,
  matrixColumns,
  summaryVerdict,
  visibleMatchDayCount,
} from './MatchDayMatrix'

// ---------------------------------------------------------------------------
// Combien de journées tiennent, et à quelle largeur (#468)
//
// The whole design of this screen is one arithmetic question, so it is pinned
// here rather than discovered on a device. The web's columns are 180 + 64 + 64
// + 80 fixed, then 96 + 96 per journée: three journées need 964pt, and an 11"
// iPad standing up has 802.
//
// «Utile» below is the window less the rail (88pt, landscape only, #447) and
// less the screen's own 32pt of margin.
// ---------------------------------------------------------------------------
it('costs what the web says it costs', () => {
  expect(MATRIX_FIXED_WIDTH).toBe(388)
  expect(MATRIX_DAY_WIDTH).toBe(192)
  // Which is where 964 comes from, and 772 for two.
  expect(MATRIX_FIXED_WIDTH + 3 * MATRIX_DAY_WIDTH).toBe(964)
  expect(MATRIX_FIXED_WIDTH + 2 * MATRIX_DAY_WIDTH).toBe(772)
})

describe('visibleMatchDayCount', () => {
  it.each([
    ['13" paysage', 1246],
    ['11" paysage', 1074],
    ['mini paysage', 1013],
    // The one that surprises: a 12.9" standing up clears 964 by 28pt.
    ['13" portrait', 992],
  ])('shows three journées on a %s', (_name, available) => {
    expect(visibleMatchDayCount(available)).toBe(3)
  })

  it('drops to two on an 11" standing up', () => {
    // 802 against the 964 three would need — the case the whole rule exists
    // for.
    expect(visibleMatchDayCount(802)).toBe(2)
  })

  it('never goes below two, even where two do not fit', () => {
    // An iPad mini upright has 712pt and two journées need 772. One journée
    // would say nothing the single-journée cards do not, at the cost of a
    // table to read it in — so the grid stays at two and the horizontal
    // scroll takes the difference.
    expect(visibleMatchDayCount(712)).toBe(2)
    expect(visibleMatchDayCount(0)).toBe(2)
  })

  it('turns over at the width itself, not around it', () => {
    expect(visibleMatchDayCount(964)).toBe(3)
    expect(visibleMatchDayCount(963)).toBe(2)
  })

  it('stops at three however wide the slab', () => {
    // Four would fit on a 13" sideways. Three is the web's own ceiling, and
    // the two grids are meant to be the same grid.
    expect(visibleMatchDayCount(4000)).toBe(3)
  })
})

describe('matrixColumns', () => {
  it('fills the width instead of leaving a band down the right', () => {
    // 964 is a floor, not a width: the web's table is `w-full` with 964 as its
    // `minWidth`. The 110pt an 11" sideways has spare go to the journées.
    const c = matrixColumns(1074, 3)

    expect(c.day).toBe(114) // 96 + its share of the slack
    expect(c.total).toBe(1074)
  })

  it('lands exactly on the width, to the point', () => {
    // The slack rarely divides evenly; the remainder goes to the name column
    // so the grid ends where the screen does rather than a point or two short.
    const c = matrixColumns(1074, 3)

    expect(c.joueur + c.dispo + c.joues + c.brulage + c.day * 6).toBe(1074)
    expect(c.joueur).toBe(182)
  })

  it('does the same with two journées', () => {
    const c = matrixColumns(802, 2)

    expect(c.day).toBe(103)
    expect(c.joueur + c.dispo + c.joues + c.brulage + c.day * 4).toBe(802)
    expect(c.total).toBe(802)
  })

  it('keeps the columns readable and overflows instead, when it must', () => {
    // The mini upright. Shrinking the columns to fit was the other option and
    // was turned down: a condensed column costs more to read than the journée
    // it buys. So the grid keeps its width and scrolls sideways by 60pt.
    const c = matrixColumns(712, 2)

    expect(c.day).toBe(96) // the floor, not 81
    expect(c.joueur).toBe(180) // no slack to hand out
    expect(c.total).toBe(772)
    expect(c.total).toBeGreaterThan(712)
  })
})

// ---------------------------------------------------------------------------
// La ligne « Résumé » (#580)
//
// The grid's Compo cells each state one player's team, so a line-up with five
// names in a four-place division looks correct on all five rows. This row is
// the only thing that answers about the journée, and the `===` below is what
// makes it answer at all.
// ---------------------------------------------------------------------------
describe('summaryVerdict', () => {
  it('turns a compo red when it holds one too many', () => {
    // The case #580 was filed on: four in the section plus a fifth fielded
    // from «Autres joueurs du club».
    expect(summaryVerdict({ available: 4, selected: 5, required: 4 })).toEqual({
      availableOk: true,
      selectedOk: false,
    })
  })

  it('turns a compo red when it is short too', () => {
    expect(summaryVerdict({ available: 4, selected: 3, required: 4 }).selectedOk).toBe(false)
  })

  it('is green only on the exact count', () => {
    expect(summaryVerdict({ available: 4, selected: 4, required: 4 }).selectedOk).toBe(true)
  })

  // The asymmetry, which is the whole point: availability is a floor and a
  // line-up is an exact count. A club with nine willing players has done
  // nothing wrong; a feuille de match with nine names is not a feuille.
  it('treats spare availability as fine and spare selection as wrong', () => {
    const plenty = summaryVerdict({ available: 9, selected: 9, required: 4 })

    expect(plenty.availableOk).toBe(true)
    expect(plenty.selectedOk).toBe(false)
  })

  it('is red on availability only below the requirement', () => {
    expect(summaryVerdict({ available: 3, selected: 4, required: 4 }).availableOk).toBe(false)
    expect(summaryVerdict({ available: 4, selected: 4, required: 4 }).availableOk).toBe(true)
  })

  // A three-player division is the other half of the seed data (GE 6, GE 7),
  // so the rule must not be 4 in disguise.
  it('reads the division, not a constant', () => {
    expect(summaryVerdict({ available: 3, selected: 3, required: 3 })).toEqual({
      availableOk: true,
      selectedOk: true,
    })
    expect(summaryVerdict({ available: 3, selected: 4, required: 3 }).selectedOk).toBe(false)
  })
})
