// Boot, level select (home), screen switching and the coin counter.
import { load, save, applyWin } from './progress.js'
import { coinDataURL, drawBus } from './art.js'
import * as level from './game.js'
import './sound.js' // unlocks audio on the first tap

const $ = (id) => document.getElementById(id)
let progress = load()

navigator.storage?.persist?.()
document.addEventListener('gesturestart', (e) => e.preventDefault()) // iOS pinch-zoom
document.addEventListener('contextmenu', (e) => e.preventDefault())

const coin = coinDataURL(128)
document.querySelectorAll('.coin').forEach((img) => (img.src = coin))

// Home Screen icon, drawn once.
const icon = document.createElement('canvas')
icon.width = icon.height = 180
const g = icon.getContext('2d')
g.fillStyle = '#FFE3F0'
g.fillRect(0, 0, 180, 180)
drawBus(g, 90, 88, 66, 150, 0, 0, '')
$('icon').href = icon.toDataURL()

const coins = () => ($('coinNum').textContent = progress.coins)

function home() {
  level.stop()
  $('level').hidden = true
  $('home').hidden = false
  const n = progress.current, locked = n >= progress.unlocked
  $('levelNum').textContent = n
  $('prev').disabled = n <= 1
  $('next').disabled = locked
  $('next').textContent = locked ? '🔒' : '▶︎'
  coins()
}

function play(n) {
  $('home').hidden = true
  $('level').hidden = false
  level.start(n)
}

function pick(d) {
  progress = { ...progress, current: progress.current + d }
  save(progress)
  home()
}

$('prev').onclick = () => pick(-1)
$('next').onclick = () => pick(1)
$('play').onclick = () => play(progress.current)

level.init({
  // Returns whether coins went up (first completion only); the counter updates when the win overlay shows.
  win(n) {
    const before = progress.coins
    progress = applyWin(progress, n)
    save(progress)
    return progress.coins > before
  },
  coins,
  balance: () => progress.coins,
  // Callers check balance() first.
  spend(n) {
    progress = { ...progress, coins: progress.coins - n }
    save(progress)
    coins()
  },
  home,
  next: () => play(progress.current),
})
home()

// Console cheat for testing: setCoins(500)
window.setCoins = (n) => {
  // load() throws away a save whose coins are not a whole number >= 0, so refuse anything else
  if (!Number.isInteger(n) || n < 0) throw new RangeError('setCoins needs a whole number of coins, 0 or more')
  progress = { ...progress, coins: n }
  save(progress)
  coins()
  return n
}
