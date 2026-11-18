import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hitDistance, overlaps, inside } from '../src/geometry.js'

const bus = (x, y, a = 0, length = 1) => ({ x, y, a, length })
const near = (v, want) => assert.ok(Math.abs(v - want) < 1e-9, `${v} != ${want}`)

test('a bus straight ahead blocks after the gap between the bodies', () => {
  near(hitDistance(bus(0.5, 2.5), bus(0.5, 0.5)), 1.16)
  near(hitDistance(bus(0.5, 3, 0, 2), bus(0.5, 0.5, 90)), 1.16) // 2 units long: nose at 2.08
})

test('only buses in the lane count: beside, behind and a full unit across are clear', () => {
  assert.equal(hitDistance(bus(0.5, 2.5), bus(1.5, 0.5)), Infinity) // one lane over
  assert.equal(hitDistance(bus(0.5, 0.5), bus(0.5, 2.5)), Infinity) // behind
  assert.ok(hitDistance(bus(0.5, 2.5), bus(1, 0.5)) < Infinity) // half a lane over still blocks
})

test('diagonal lanes', () => {
  const d = bus(0.5, 3.5, 45)
  const hit = hitDistance(d, bus(2.5, 1.5))
  assert.ok(hit > 0 && hit < 2 * Math.SQRT2, `hit ${hit}`)
  assert.equal(hitDistance(d, bus(2.5, 3.5)), Infinity)
  assert.ok(hitDistance(bus(0.5, 2.5), bus(0.5, 0.5, 135)) < Infinity) // an axis bus blocked by a diagonal one
})

test('overlap and bounds', () => {
  assert.ok(overlaps(bus(1, 1), bus(1.2, 1.2, 45)))
  assert.ok(!overlaps(bus(0.5, 0.5), bus(1.5, 0.5), 0.08)) // side by side: 0.16 apart
  assert.ok(overlaps(bus(0.5, 0.5), bus(1.5, 0.5), 0.2))
  assert.ok(inside(bus(0.5, 0.5), 1, 1) && !inside(bus(0.5, 0.5, 45, 2), 1, 1))
})
